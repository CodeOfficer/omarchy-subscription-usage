import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import QtQuick.Effects
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

Panel {
  id: root
  moduleName: "codeofficer.subscription-usage"
  ipcTarget: "codeofficer.subscription-usage"
  manageIpc: false

  property double nowMs: Date.now()
  // The panel discloses detail in three views, ← → or 1 2 3 to move:
  // Overview (each plan at a glance), Models (per-model quota and tokens),
  // Debug (which checks on each provider's data pass, fail or changed).
  readonly property var viewNames: ["Overview", "Models", "Debug"]
  property int view: 0
  readonly property color foreground: Color.popups.text
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property bool alarming: shown.some(function(id) { return Model.paceAlarm(providerAt(id), nowMs, paceTolerance) })
  // Providers are looked up by id rather than handed through a Repeater's
  // modelData: QML turns nested arrays there into list types that fail
  // Array.isArray, and the cards would lose their charts and lists.
  // Settings from the manifest schema (Setup › Plugins, or `omarchy bar set`).
  readonly property var shown: service.shown
  readonly property real paceTolerance: service.intSetting("paceTolerancePercent", 5, 0, 25) / 100
  readonly property bool barShowsReset: String(service.setting("barDetail", "Percent")) === "Percent and reset"

  function providerAt(id) {
    return service.record(id)
  }

  implicitWidth: usageButton.implicitWidth
  implicitHeight: usageButton.implicitHeight

  function refresh() {
    nowMs = Date.now()
    service.refresh()
  }

  function showView(index) {
    view = (index + viewNames.length) % viewNames.length
    panelFlick.contentY = 0
  }

  function scrollBy(steps) {
    var top = Math.max(0, panelFlick.contentHeight - panelFlick.height)
    panelFlick.contentY = Math.max(0, Math.min(top, panelFlick.contentY + steps * Style.space(60)))
  }

  onOpenedChanged: if (opened) {
    nowMs = Date.now()
    showView(0)
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  Timer {
    interval: 30000
    repeat: true
    running: true
    onTriggered: root.nowMs = Date.now()
  }

  Service {
    id: service
    settings: root.settings
  }

  IpcHandler {
    target: root.ipcTarget
    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): string { root.refresh(); return "ok" }
    function view(index: string): string { root.showView(parseInt(index, 10) - 1); return root.viewNames[root.view] }
    function debug(): string { root.showView(root.view === 2 ? 0 : 2); return root.viewNames[root.view] }
    function signin(id: string): string { return service.signIn(id) ? "opened" : "not available" }
    function status(): string {
      var result = { refreshing: service.refreshing, signingIn: service.signingIn, error: service.lastError }
      root.shown.forEach(function(id) { result[id] = root.providerStatus(service.record(id)) })
      return JSON.stringify(result)
    }
  }

  function providerStatus(provider) {
    var headline = provider ? provider.headline : null
    return {
      window: Model.windowName(headline),
      remaining: headline ? headline.remaining : null,
      resetsAt: headline && Model.started(headline) ? new Date(headline.resetMs).toISOString() : "",
      behindPace: Model.paceAlarm(provider, nowMs, root.paceTolerance),
      signInNeeded: !!provider && provider.signInNeeded === true,
      status: provider ? provider.status : "",
      problems: provider && Array.isArray(provider.warnings) ? provider.warnings : [],
      run: provider && provider.debug ? provider.debug : null
    }
  }

  // The checks the Debug view lists: the collector run, then the record's own.
  function checksOf(provider) {
    var run = provider && provider.debug ? provider.debug : null
    var list = []
    if (run) {
      var seconds = (run.ms / 1000).toFixed(1) + " s"
      list.push({ name: "Collector ran · " + seconds, state: run.exitCode === 0 ? "pass" : "fail",
        detail: run.exitCode === 0 ? "" : "exit " + run.exitCode + (run.stderr ? " · " + run.stderr : "") })
    }
    return list.concat(provider && Array.isArray(provider.checks) ? provider.checks : [])
  }

  WidgetButton {
    id: usageButton
    anchors.fill: parent
    bar: root.bar
    labelVisible: false
    hasVisualContent: true
    fixedWidth: vertical ? -1 : barContent.implicitWidth + Style.space(16)
    tooltipText: "Plan usage · click for reset times and details"
    active: root.alarming
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.RightButton || buttonCode === Qt.MiddleButton) root.refresh()
      else root.toggle()
    }

    Row {
      id: barContent
      anchors.centerIn: parent
      spacing: Style.space(12)

      Repeater {
        model: root.shown
        delegate: Row {
          required property string modelData
          required property int index
          spacing: Style.space(12)
          anchors.verticalCenter: parent ? parent.verticalCenter : undefined

          Rectangle {
            visible: index > 0
            width: 1
            height: Style.space(13)
            anchors.verticalCenter: parent.verticalCenter
            color: Qt.darker(root.barForeground, 1.55)
            opacity: 0.65
          }

          ProviderChip {
            provider: root.providerAt(modelData)
            iconSource: service.iconOf(modelData)
            tintIcon: service.tinted(modelData)
          }
        }
      }
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: usageButton
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(410))
    // Never taller than the screen; scrolls (↑ ↓ or the wheel) when the
    // content is taller than the panel.
    contentHeight: panel.fittedContentHeight(panelContent.implicitHeight, Style.space(960))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onActivateRequested: root.refresh()
      onMoveRequested: function(dx, dy) {
        if (dx !== 0) root.showView(root.view + dx)
        else if (dy !== 0) root.scrollBy(dy)
      }
      onTextKey: function(text) {
        if (text === "r" || text === "R") root.refresh()
        else if (text === "1" || text === "2" || text === "3") root.showView(Number(text) - 1)
        else if (text === "d" || text === "D") root.showView(root.view === 2 ? 0 : 2)
      }

      Flickable {
        id: panelFlick
        anchors.fill: parent
        contentWidth: width
        contentHeight: panelContent.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Column {
          id: panelContent
          width: panelFlick.width
          spacing: Style.space(12)

          RowLayout {
            width: parent.width

            Text {
              Layout.fillWidth: true
              text: "SUBSCRIPTION USAGE"
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
            }

            Text {
              text: service.refreshing ? "Refreshing…" : "← → · R refresh"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }

          // View tabs: the current one bright, click or 1 2 3 to switch.
          Row {
            spacing: Style.space(14)

            Repeater {
              model: root.viewNames
              delegate: Text {
                required property string modelData
                required property int index
                text: (index + 1) + " " + modelData.toUpperCase()
                color: index === root.view ? root.foreground : root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: index === root.view
                font.underline: index === root.view

                MouseArea {
                  anchors.fill: parent
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.showView(index)
                }
              }
            }
          }

          PanelSeparator { width: parent.width; foreground: root.foreground }

          Repeater {
            model: root.shown
            delegate: Column {
              required property string modelData
              required property int index
              width: panelContent.width
              spacing: Style.space(12)

              PanelSeparator { visible: index > 0; width: parent.width; foreground: root.foreground }

              OverviewCard {
                visible: root.view === 0
                width: parent.width
                provider: root.providerAt(modelData)
                iconSource: service.iconOf(modelData)
                tintIcon: service.tinted(modelData)
              }

              ModelsCard {
                visible: root.view === 1
                width: parent.width
                provider: root.providerAt(modelData)
                iconSource: service.iconOf(modelData)
                tintIcon: service.tinted(modelData)
              }

              ChecksCard {
                visible: root.view === 2
                width: parent.width
                provider: root.providerAt(modelData)
                iconSource: service.iconOf(modelData)
                tintIcon: service.tinted(modelData)
              }
            }
          }

          Text {
            visible: service.lastError !== "" && root.view !== 2
            width: parent.width
            textFormat: Text.PlainText
            text: service.lastError
            color: root.urgent
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            wrapMode: Text.WordWrap
          }
        }
      }
    }
  }

  component ProviderIcon: Item {
    id: providerIcon
    property url source: ""
    property bool tinted: false
    property color color: root.foreground
    property real iconSize: Style.space(12)
    width: iconSize
    height: iconSize

    Image {
      anchors.fill: parent
      source: providerIcon.source
      visible: !providerIcon.tinted
      sourceSize.width: providerIcon.iconSize * 2
      sourceSize.height: providerIcon.iconSize * 2
      fillMode: Image.PreserveAspectFit
    }

    Image {
      id: maskIcon
      anchors.fill: parent
      source: providerIcon.source
      visible: false
      sourceSize.width: providerIcon.iconSize * 2
      sourceSize.height: providerIcon.iconSize * 2
      fillMode: Image.PreserveAspectFit
    }

    MultiEffect {
      anchors.fill: parent
      source: maskIcon
      visible: providerIcon.tinted
      colorization: 1.0
      colorizationColor: providerIcon.color
    }
  }

  component ProviderChip: Row {
    id: chip
    required property var provider
    property url iconSource: ""
    property bool tintIcon: false
    readonly property var headline: provider ? provider.headline : null
    readonly property bool behind: Model.paceAlarm(provider, root.nowMs, root.paceTolerance)
    spacing: Style.space(5)
    anchors.verticalCenter: parent ? parent.verticalCenter : undefined

    ProviderIcon {
      anchors.verticalCenter: parent.verticalCenter
      source: chip.iconSource
      tinted: chip.tintIcon
      color: chip.behind ? root.urgent : root.barForeground
    }

    Text {
      anchors.verticalCenter: parent.verticalCenter
      text: chip.provider.name
      color: chip.behind ? root.urgent : root.barForeground
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      font.bold: true
    }

    Text {
      anchors.verticalCenter: parent.verticalCenter
      // Percent only by default, to keep the bar narrow (setting barDetail).
      text: !chip.headline ? "—"
        : Model.percent(chip.headline.used) + (root.barShowsReset ? " · " + Model.shortResetText(chip.headline, root.nowMs) : "")
      color: chip.behind ? root.urgent : root.barForeground
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  // Icon, name, and one line under it: shared by all three views.
  component CardHeader: Row {
    id: header
    property var provider
    property url iconSource: ""
    property bool tintIcon: false
    property string line: ""
    property color lineColor: root.dim
    property color nameColor: root.foreground
    spacing: Style.space(9)

    ProviderIcon {
      anchors.verticalCenter: parent.verticalCenter
      source: header.iconSource
      tinted: header.tintIcon
      color: header.nameColor
      iconSize: Style.space(18)
    }

    Column {
      width: parent.width - x
      spacing: Style.space(2)

      Text {
        textFormat: Text.PlainText
        text: header.provider ? header.provider.name : ""
        color: header.nameColor
        font.family: root.fontFamily
        font.pixelSize: Style.font.title
        font.bold: true
      }

      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: header.line
        color: header.lineColor
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        elide: Text.ElideRight
      }
    }
  }

  // A label on the left, a value on the right, in caption size.
  component InfoRow: RowLayout {
    property string label: ""
    property string value: ""
    property color labelColor: root.dim
    property color valueColor: root.dim

    Text {
      Layout.fillWidth: true
      textFormat: Text.PlainText
      text: parent.label
      color: parent.labelColor
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
    }

    Text {
      textFormat: Text.PlainText
      text: parent.value
      color: parent.valueColor
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  component SectionTitle: Text {
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    font.bold: true
  }

  // ---- 1 Overview: the plan at a glance -------------------------------

  component OverviewCard: Column {
    id: card
    required property var provider
    property url iconSource: ""
    property bool tintIcon: false
    readonly property var pace: provider ? provider.pace : null
    readonly property var headline: provider ? provider.headline : null
    readonly property bool behind: Model.paceAlarm(provider, root.nowMs, root.paceTolerance)
    spacing: Style.space(8)

    CardHeader {
      width: parent.width
      provider: card.provider
      iconSource: card.iconSource
      tintIcon: card.tintIcon
      nameColor: card.behind ? root.urgent : root.foreground
      lineColor: card.behind ? root.urgent : root.dim
      line: card.headline ? Model.headlineText(card.headline, root.nowMs) : (card.provider.status || "Usage limit unavailable")
    }

    Rectangle {
      visible: !!card.headline
      width: parent.width
      height: Style.space(5)
      radius: height / 2
      color: Qt.darker(root.foreground, 2.5)

      Rectangle {
        width: parent.width * (card.headline ? card.headline.used : 0)
        height: parent.height
        radius: parent.radius
        color: card.behind ? root.urgent : root.foreground
      }
    }

    InfoRow {
      visible: !!card.pace
      width: parent.width
      label: Model.paceText(card.pace, root.nowMs, root.paceTolerance)
      labelColor: card.behind ? root.urgent : root.dim
      value: Model.expectedText(card.pace, root.nowMs)
    }

    Text {
      visible: !!card.headline && card.headline.detail !== ""
      width: parent.width
      textFormat: Text.PlainText
      text: card.headline ? card.headline.detail : ""
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }

    // A notice from the provider while numbers still show: old numbers
    // (a lapsed sign-in) in the alarm colour, anything else dim.
    Text {
      visible: !!card.headline && !!card.provider.status
      width: parent.width
      textFormat: Text.PlainText
      text: card.provider.status || ""
      color: card.provider.live === false ? root.urgent : root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      wrapMode: Text.WordWrap
      maximumLineCount: 3
      elide: Text.ElideRight
    }

    // No CLI keeps this provider's sign-in: open the plugin's own browser
    // window for it (bin/browser-signin).
    Text {
      visible: card.provider && card.provider.signInNeeded === true && service.canSignIn(card.provider.id)
      textFormat: Text.PlainText
      text: service.signingIn ? "Signing in… close the window when done" : "→ Sign in to " + card.provider.name
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      font.bold: true
      font.underline: !service.signingIn

      MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: service.signIn(card.provider.id)
      }
    }

    Column {
      visible: card.provider && Array.isArray(card.provider.recentDays) && card.provider.recentDays.length > 0
      width: parent.width
      spacing: Style.space(5)

      SectionTitle {
        text: "LAST 7 DAYS · " + Model.tokenCount(Model.recentTotal(card.provider.recentDays)) + " " + String(card.provider.recentUnit || "tokens").toUpperCase()
      }

      Row {
        id: dailyChart
        width: parent.width
        spacing: Style.space(4)

        Repeater {
          model: card.provider.recentDays

          delegate: Column {
            required property var modelData
            readonly property real tokens: Model.dayTokens(modelData)
            // null: before the provider's history began (Suno), not zero.
            readonly property bool known: modelData.messageCount !== null && modelData.messageCount !== undefined
            readonly property real peak: Math.max(1, Model.recentPeak(card.provider.recentDays))
            width: (dailyChart.width - dailyChart.spacing * 6) / 7
            spacing: Style.space(2)

            Text {
              width: parent.width
              text: parent.known ? Model.tokenCount(parent.tokens) : "–"
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              horizontalAlignment: Text.AlignHCenter
            }

            Item {
              width: parent.width
              height: Style.space(28)

              Rectangle {
                anchors.bottom: parent.bottom
                anchors.horizontalCenter: parent.horizontalCenter
                width: Math.max(Style.space(8), parent.width - Style.space(8))
                height: parent.parent.tokens > 0 ? Math.max(1, parent.height * parent.parent.tokens / parent.parent.peak) : 0
                radius: Style.space(2)
                color: card.behind ? root.urgent : root.foreground
                opacity: 0.72
              }
            }

            Text {
              width: parent.width
              text: Model.dayLabel(parent.modelData.date)
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              horizontalAlignment: Text.AlignHCenter
            }
          }
        }
      }
    }

    // The plan's other windows (Claude's 5-hour session). Model-scoped
    // allowances are on the Models view.
    Repeater {
      model: card.provider && Array.isArray(card.provider.limits) ? card.provider.limits : []
      delegate: InfoRow {
        required property var modelData
        width: card.width
        // Compared by flags and labels: objects lose identity through modelData.
        visible: !modelData.primary && !modelData.scoped
          && String(modelData.label || "").toLowerCase().indexOf("weekly") !== 0
        label: modelData.label
        // Counts when the collector gives them ("3 of 20 used"), else percent.
        value: (modelData.detail ? modelData.detail : Model.percent(modelData.used) + " used") + " · " + Model.shortResetText(modelData, root.nowMs)
      }
    }
  }

  // ---- 2 Models: per-model quota and today's tokens -------------------

  component ModelsCard: Column {
    id: models
    required property var provider
    property url iconSource: ""
    property bool tintIcon: false
    readonly property var pools: provider && Array.isArray(provider.pools) ? provider.pools : []
    readonly property var scoped: provider && Array.isArray(provider.limits)
      ? provider.limits.filter(function(l) { return l.scoped }) : []
    readonly property var today: provider && Array.isArray(provider.todayModels) ? provider.todayModels : []
    readonly property var planModels: provider && Array.isArray(provider.planModels) ? provider.planModels : []
    readonly property bool tracksTokens: !!provider && provider.tracksTokens !== false
    spacing: Style.space(8)

    CardHeader {
      width: parent.width
      provider: models.provider
      iconSource: models.iconSource
      tintIcon: models.tintIcon
      lineColor: models.provider.live === false ? root.urgent : root.dim
      line: models.provider.live === false ? "Per-model detail needs a fresh answer · " + (models.provider.status || "not signed in")
        : models.pools.length > 0
        ? models.pools.length + " quota groups · " + (models.provider.tier || "plan") + " plan"
        : "One limit for every model · " + (models.provider.tier || "plan") + " plan"
    }

    SectionTitle {
      visible: models.pools.length > 0
      text: "QUOTA BY MODEL"
    }

    Repeater {
      model: models.pools
      delegate: Column {
        required property var modelData
        width: models.width
        spacing: Style.space(1)

        InfoRow {
          width: parent.width
          label: modelData.label
          labelColor: root.foreground
          value: Model.poolText(modelData, root.nowMs)
          valueColor: modelData.used > 0 ? root.foreground : root.dim
        }

        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: Model.poolModelsText(modelData)
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
          maximumLineCount: 2
          elide: Text.ElideRight
          opacity: 0.8
        }
      }
    }

    SectionTitle {
      visible: models.scoped.length > 0
      text: "MODEL ALLOWANCES"
    }

    Repeater {
      model: models.scoped
      delegate: InfoRow {
        required property var modelData
        width: models.width
        label: modelData.label
        value: modelData.used > 0 ? Model.percent(modelData.used) + " used · " + Model.shortResetText(modelData, root.nowMs) : "unused"
      }
    }

    SectionTitle {
      visible: models.planModels.length > 0
      text: "MODELS ON THIS PLAN"
    }

    Text {
      visible: models.planModels.length > 0
      width: models.width
      textFormat: Text.PlainText
      text: models.planModels.join(", ")
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      wrapMode: Text.WordWrap
    }

    SectionTitle {
      visible: models.tracksTokens
      text: "TODAY BY MODEL"
    }

    Repeater {
      model: models.today
      delegate: InfoRow {
        required property var modelData
        width: models.width
        label: Model.modelName(modelData.model)
        labelColor: root.foreground
        value: Model.tokenCount(modelData.tokens) + " tokens"
      }
    }

    Text {
      visible: models.tracksTokens && models.today.length === 0
      text: "No tokens today"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  // ---- 3 Debug: checks on each provider's data -------------------------

  component ChecksCard: Column {
    id: checksCard
    required property var provider
    property url iconSource: ""
    property bool tintIcon: false
    readonly property var checks: root.checksOf(provider)
    readonly property int failed: checks.filter(function(c) { return c.state === "fail" }).length
    readonly property int changed: checks.filter(function(c) { return c.state === "changed" }).length
    readonly property int skippedCount: checks.filter(function(c) { return c.state === "skipped" }).length
    readonly property int passed: checks.length - failed - changed - skippedCount
    spacing: Style.space(6)

    CardHeader {
      width: parent.width
      provider: checksCard.provider
      iconSource: checksCard.iconSource
      tintIcon: checksCard.tintIcon
      lineColor: checksCard.failed > 0 ? root.urgent : root.dim
      line: checksCard.checks.length === 0 ? "Not checked yet"
        : checksCard.failed > 0 ? checksCard.failed + " failed · " + checksCard.passed + " passed" + (checksCard.skippedCount ? " · " + checksCard.skippedCount + " skipped" : "")
        : checksCard.changed > 0 ? "All good · " + checksCard.changed + " changed since baseline"
        : "All " + checksCard.checks.length + " checks pass"
    }

    Repeater {
      model: checksCard.checks
      delegate: Column {
        required property var modelData
        width: checksCard.width
        spacing: Style.space(1)

        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: (modelData.state === "pass" ? "✓  " : modelData.state === "changed" ? "◆  " : modelData.state === "skipped" ? "–  " : "✗  ") + modelData.name
          color: modelData.state === "fail" ? root.urgent : modelData.state === "changed" ? root.foreground : root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          font.bold: modelData.state === "fail" || modelData.state === "changed"
          opacity: modelData.state === "skipped" ? 0.6 : 1
        }

        Text {
          visible: modelData.detail !== "" && modelData.state !== "skipped"
          width: parent.width
          leftPadding: Style.space(18)
          textFormat: Text.PlainText
          text: modelData.detail
          color: modelData.state === "fail" ? root.urgent : root.dim
          opacity: modelData.state === "skipped" ? 0.6 : 1
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }
      }
    }
  }
}
