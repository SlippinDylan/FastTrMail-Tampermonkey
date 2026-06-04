const { JSDOM } = require("jsdom");

function installDom(html = "<!doctype html><html><head></head><body></body></html>") {
  const dom = new JSDOM(html, { url: "https://app.fastmail.com/mail/Inbox" });
  const previous = {
    window: global.window,
    document: global.document,
    location: global.location,
    navigator: global.navigator,
    Element: global.Element,
    HTMLElement: global.HTMLElement,
    HTMLButtonElement: global.HTMLButtonElement,
    HTMLBRElement: global.HTMLBRElement,
    HTMLHRElement: global.HTMLHRElement,
    Node: global.Node,
    MutationObserver: global.MutationObserver,
    getComputedStyle: global.getComputedStyle
  };

  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;
  global.navigator = dom.window.navigator;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  global.HTMLButtonElement = dom.window.HTMLButtonElement;
  global.HTMLBRElement = dom.window.HTMLBRElement;
  global.HTMLHRElement = dom.window.HTMLHRElement;
  global.Node = dom.window.Node;
  global.MutationObserver = dom.window.MutationObserver;
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

  if (!Object.getOwnPropertyDescriptor(dom.window.HTMLElement.prototype, "innerText")) {
    Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", {
      configurable: true,
      get() {
        return this.textContent;
      },
      set(value) {
        this.textContent = value;
      }
    });
  }

  Object.defineProperty(dom.window.HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value() {
      return { width: 100, height: 24, top: 0, left: 0, right: 100, bottom: 24 };
    }
  });

  return {
    dom,
    cleanup() {
      dom.window.close();
      global.window = previous.window;
      global.document = previous.document;
      global.location = previous.location;
      global.navigator = previous.navigator;
      global.Element = previous.Element;
      global.HTMLElement = previous.HTMLElement;
      global.HTMLButtonElement = previous.HTMLButtonElement;
      global.HTMLBRElement = previous.HTMLBRElement;
      global.HTMLHRElement = previous.HTMLHRElement;
      global.Node = previous.Node;
      global.MutationObserver = previous.MutationObserver;
      global.getComputedStyle = previous.getComputedStyle;
    }
  };
}

module.exports = { installDom };
