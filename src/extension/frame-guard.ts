// Self-contained: Chrome serializes this function into the isolated content-script world.
export function frameGuard(mode: 'prepare' | 'check' | 'remove') {
  const maskId = '__omni_privacy_masks';
  const remove = () => {
    document.getElementById(maskId)?.remove();
    for (const id of ['__omni_live_widget', 'omni-poc-widget']) {
      const widget = document.getElementById(id);
      if (widget) widget.style.visibility = '';
    }
  };
  if (mode === 'remove') {
    remove();
    return { url: location.href, sensitive: false, editing: false, masks: 0 };
  }
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect(),
      s = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth &&
      s.display !== 'none' &&
      s.visibility !== 'hidden' &&
      s.opacity !== '0'
    );
  };
  const sensitive =
    [
      ...document.querySelectorAll(
        'input[type="password"],input[autocomplete^="cc-"],input[autocomplete="one-time-code"]',
      ),
    ].some(visible) ||
    /로그인|회원가입|결제|인터넷뱅킹|진료|의료|병원|비밀번호|password|checkout|sign in|log in|medical|hospital/i.test(
      document.title,
    );
  const active = document.activeElement;
  const editing =
    !!active &&
    active.matches(
      'input,textarea,select,[contenteditable="true"],[role="textbox"]',
    );
  let count = 0;
  if (mode === 'prepare' && !sensitive && !editing) {
    remove();
    const host = document.createElement('div');
    host.id = maskId;
    const shadow = host.attachShadow({ mode: 'closed' });
    const cover = (rect: DOMRect) => {
      const mask = document.createElement('div');
      mask.style.cssText = `position:fixed;pointer-events:none;z-index:2147483647;background:#111;left:${Math.max(0, rect.left - 3)}px;top:${Math.max(0, rect.top - 3)}px;width:${Math.min(innerWidth, rect.width + 6)}px;height:${Math.min(innerHeight, rect.height + 6)}px;`;
      shadow.append(mask);
      count++;
    };
    // Hide user input, cross-origin embeds, avatars, account menus and comment panels.
    for (const el of document.querySelectorAll(
      'input,textarea,[contenteditable="true"],iframe,[role="textbox"],img[alt*="profile" i],img[alt*="프로필"],a[href^="/direct"],ytd-comments,ytd-live-chat-frame,ytd-masthead #end,[id*="comment" i],[aria-label*="account" i],[aria-label*="계정"],[aria-label*="댓글"]',
    )) {
      if (visible(el)) cover(el.getBoundingClientRect());
    }
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let node: Node | null;
    let scanned = 0;
    while ((node = walker.nextNode()) && scanned++ < 8000) {
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest('script,style,noscript,#__omni_live_widget') ||
        !visible(parent)
      )
        continue;
      if (
        /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:\d[ -]?){13,19}\b|\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b|@[a-z0-9_.]{3,}/i.test(
          node.textContent || '',
        )
      ) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) cover(rect);
      }
    }
    document.documentElement.append(host);
    for (const id of ['__omni_live_widget', 'omni-poc-widget']) {
      const widget = document.getElementById(id);
      if (widget) widget.style.visibility = 'hidden';
    }
    setTimeout(remove, 2000); // Failsafe if capture or service worker fails.
  }
  return { url: location.href, sensitive, editing, masks: count };
}
