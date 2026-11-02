const STACKED_QUERY = '(max-width: 900px)';
const AUDIO_BUTTON_CLEARANCE = 44;
const AUDIO_TOP_INSET = 6;
const STACKED_GAP = 12;
const SIDE_GAP = 24;
const PANEL_BOTTOM_MARGIN = 8;
const OFFSCREEN_MARGIN = 32;

function stackedGeometry({ stage, editPanel, holder }) {
  const top = stage.offsetTop + AUDIO_BUTTON_CLEARANCE;
  return {
    left: editPanel.offsetLeft,
    top,
    height: Math.min(editPanel.offsetHeight, holder.clientHeight - top - PANEL_BOTTOM_MARGIN),
    stageX: 0,
    stageY: -(stage.offsetTop + stage.offsetHeight + STACKED_GAP)
  };
}

function sideBySideGeometry({ stage, editPanel, holder }) {
  return {
    left: (holder.clientWidth - editPanel.offsetWidth) / 2,
    top: editPanel.offsetTop,
    height: editPanel.offsetHeight,
    stageX: -(stage.offsetLeft + stage.offsetWidth + SIDE_GAP),
    stageY: 0
  };
}

export class ExportLayout {
  constructor({ body, stage, editPanel }) {
    this.body = body;
    this.stage = stage;
    this.editPanel = editPanel;
  }

  update() {
    const { body, stage, editPanel } = this;
    const holder = stage.parentElement;
    const bounds = holder.getBoundingClientRect();
    const stacked = window.matchMedia(STACKED_QUERY).matches;
    const geometry = (stacked ? stackedGeometry : sideBySideGeometry)({ stage, editPanel, holder });
    const offRight = panelLeft => window.innerWidth - (bounds.left + panelLeft) + OFFSCREEN_MARGIN;

    const properties = {
      '--exp-left': geometry.left,
      '--exp-top': geometry.top,
      '--exp-w': editPanel.offsetWidth,
      '--exp-h': geometry.height,
      '--exp-off': offRight(geometry.left),
      '--ed-off': offRight(editPanel.offsetLeft),
      '--st-x': geometry.stageX,
      '--st-y': geometry.stageY,
      '--audio-top': Math.max(0, bounds.top) + AUDIO_TOP_INSET
    };

    for (const [name, value] of Object.entries(properties)) {
      body.style.setProperty(name, `${value}px`);
    }
  }

  skipTransition() {
    const { classList } = this.body;
    classList.add('export-instant');
    requestAnimationFrame(() => requestAnimationFrame(() => classList.remove('export-instant')));
  }
}