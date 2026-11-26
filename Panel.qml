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
  moduleName: "codeofficer.agent-usage"
  ipcTarget: "codeofficer.agent-usage"
  manageIpc: false

  property double nowMs: Date.now()
  readonly property color foreground: Color.popups.text
  readonly property color urgent: bar ? bar.urgent : Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.55)
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property bool alarming: Model.behindPace(service.claude.weekly, nowMs)
    || Model.behindPace(service.codex.weekly, nowMs)
    || Model.behindPace(service.gemini.weekly, nowMs)

  implicitWidth: usageButton.implicitWidth
  implicitHeight: usageButton.implicitHeight

  function refresh() {
    nowMs = Date.now()
    service.refresh()
  }

  onOpenedChanged: if (opened) {
    nowMs = Date.now()
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
    function status(): string {
      return JSON.stringify({
        refreshing: service.refreshing,
        claude: root.providerStatus(service.claude),
        codex: root.providerStatus(service.codex),
        gemini: root.providerStatus(service.gemini),
        error: service.lastError
      })
    }
  }

  function providerStatus(provider) {
    var weekly = provider ? provider.weekly : null
    return {
      remaining: weekly ? weekly.remaining : null,
      resetsAt: weekly && Model.started(weekly) ? new Date(weekly.resetMs).toISOString() : "",
      behindPace: Model.behindPace(weekly, nowMs),
      status: provider ? provider.status : ""
    }
  }

  WidgetButton {
    id: usageButton
    anchors.fill: parent
    bar: root.bar
    labelVisible: false
    hasVisualContent: true
    fixedWidth: vertical ? -1 : barContent.implicitWidth + Style.space(16)
    tooltipText: "Weekly allowance used · click for reset times and details"
    active: root.alarming
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.RightButton || buttonCode === Qt.MiddleButton) root.refresh()
      else root.toggle()
    }

    Row {
      id: barContent
      anchors.centerIn: parent
      spacing: Style.space(12)

      ProviderChip {
        provider: service.claude
        iconSource: Qt.resolvedUrl("claude.svg")
        tintIcon: false
      }

      Rectangle {
        width: 1
        height: Style.space(13)
        anchors.verticalCenter: parent.verticalCenter
        color: Qt.darker(root.barForeground, 1.55)
        opacity: 0.65
      }

      ProviderChip {
        provider: service.codex
        iconSource: Qt.resolvedUrl("codex.svg")
        tintIcon: true
      }

      Rectangle {
        width: 1
        height: Style.space(13)
        anchors.verticalCenter: parent.verticalCenter
        color: Qt.darker(root.barForeground, 1.55)
        opacity: 0.65
      }

      ProviderChip {
        provider: service.gemini
        iconSource: Qt.resolvedUrl("gemini.svg")
        tintIcon: true
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
    // Three providers need more room than two; the panel still never grows past
    // the screen, and scrolls when the content is taller than it.
    contentHeight: panel.fittedContentHeight(panelContent.implicitHeight, Style.space(960))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onActivateRequested: root.refresh()
      onTextKey: function(text) { if (text === "r" || text === "R") root.refresh() }

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
            text: "AGENT USAGE"
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.title
            font.bold: true
          }

          Text {
            text: service.refreshing ? "Refreshing…" : "R to refresh"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
        }

        PanelSeparator { width: parent.width; foreground: root.foreground }

        ProviderCard {
          width: parent.width
          provider: service.claude
          iconSource: Qt.resolvedUrl("claude.svg")
          tintIcon: false
        }

        PanelSeparator { width: parent.width; foreground: root.foreground }

        ProviderCard {
          width: parent.width
          provider: service.codex
          iconSource: Qt.resolvedUrl("codex.svg")
          tintIcon: true
        }

        PanelSeparator { width: parent.width; foreground: root.foreground }

        ProviderCard {
          width: parent.width
          provider: service.gemini
          iconSource: Qt.resolvedUrl("gemini.svg")
          tintIcon: true
        }

        Text {
          visible: service.lastError !== ""
          width: parent.width
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
      id: plainIcon
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
    readonly property var weekly: provider ? provider.weekly : null
    readonly property var headline: provider ? provider.headline : null
    readonly property bool behind: Model.behindPace(weekly, root.nowMs)
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
      // Percent only, to keep the bar narrow; reset times are in the panel.
      text: chip.headline ? Model.percent(chip.headline.used) : "—"
      color: chip.behind ? root.urgent : root.barForeground
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  component ProviderCard: Column {
    id: card
    required property var provider
    property url iconSource: ""
    property bool tintIcon: false
    readonly property var weekly: provider ? provider.weekly : null
    readonly property var headline: provider ? provider.headline : null
    readonly property bool behind: Model.behindPace(weekly, root.nowMs)
    spacing: Style.space(8)

    Row {
      width: parent.width
      spacing: Style.space(9)

      ProviderIcon {
        anchors.verticalCenter: parent.verticalCenter
        source: card.iconSource
        tinted: card.tintIcon
        color: card.behind ? root.urgent : root.foreground
        iconSize: Style.space(18)
      }

      Column {
        width: parent.width - x
        spacing: Style.space(2)

        Text {
          text: card.provider.name
          color: card.behind ? root.urgent : root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.title
          font.bold: true
        }

        Text {
          textFormat: Text.PlainText
          text: card.headline
            ? Model.percent(card.headline.used)
              + (Model.windowName(card.headline) === "weekly" ? " used · " : " of " + Model.windowName(card.headline) + " used · ")
              + Model.resetText(card.headline, root.nowMs)
            : (card.provider.status || "Usage limit unavailable")
          color: card.behind ? root.urgent : root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.body
        }
      }
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

    RowLayout {
      visible: !!card.weekly
      width: parent.width

      Text {
        Layout.fillWidth: true
        text: Model.paceText(card.weekly, root.nowMs)
        color: card.behind ? root.urgent : root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }

      Text {
        text: Model.expectedText(card.weekly, root.nowMs)
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    Column {
      visible: card.provider && Array.isArray(card.provider.recentDays) && card.provider.recentDays.length > 0
      width: parent.width
      spacing: Style.space(5)

      Text {
        text: "LAST 7 DAYS · " + Model.tokenCount(Model.recentTotal(card.provider.recentDays)) + " TOKENS"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
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
            readonly property real peak: Math.max(1, Model.recentPeak(card.provider.recentDays))
            width: (dailyChart.width - dailyChart.spacing * 6) / 7
            spacing: Style.space(2)

            Text {
              width: parent.width
              text: Model.tokenCount(parent.tokens)
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

    Repeater {
      model: card.provider && Array.isArray(card.provider.limits) ? card.provider.limits : []
      delegate: RowLayout {
        required property var modelData
        width: card.width
        visible: String(modelData.label || "").toLowerCase().indexOf("weekly") !== 0 && !modelData.primary

        Text {
          Layout.fillWidth: true
          textFormat: Text.PlainText
          text: modelData.label
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }

        Text {
          text: Model.percent(modelData.used) + " used · " + Model.shortResetText(modelData, root.nowMs)
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }

    // Quota by model: groups of models that share one allowance, where the
    // provider reports them (Google does, per model).
    Column {
      visible: card.provider && Array.isArray(card.provider.pools) && card.provider.pools.length > 0
      width: parent.width
      spacing: Style.space(5)

      Text {
        text: "QUOTA BY MODEL"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
      }

      Repeater {
        model: card.provider && Array.isArray(card.provider.pools) ? card.provider.pools : []
        delegate: Column {
          required property var modelData
          width: card.width
          spacing: Style.space(1)

          RowLayout {
            width: parent.width

            Text {
              Layout.fillWidth: true
              textFormat: Text.PlainText
              text: modelData.label
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }

            Text {
              textFormat: Text.PlainText
              text: Model.poolText(modelData, root.nowMs)
              color: modelData.used > 0 ? root.foreground : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }

          Text {
            width: parent.width
            textFormat: Text.PlainText
            text: modelData.models.join(", ")
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
            opacity: 0.8
          }
        }
      }
    }

    // Tokens per model today, from the CLIs' own session logs.
    Column {
      visible: card.provider && Array.isArray(card.provider.todayModels) && card.provider.todayModels.length > 0
      width: parent.width
      spacing: Style.space(3)

      Text {
        text: "TODAY BY MODEL"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        font.bold: true
      }

      Repeater {
        model: card.provider && Array.isArray(card.provider.todayModels) ? card.provider.todayModels : []
        delegate: RowLayout {
          required property var modelData
          width: card.width

          Text {
            Layout.fillWidth: true
            textFormat: Text.PlainText
            text: modelData.model
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }

          Text {
            text: Model.tokenCount(modelData.tokens) + " tokens"
            color: root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
        }
      }
    }
  }
}
