import { Window } from "happy-dom";

let registered = false;

export function registerHappyDom(): Window {
  if (registered && globalThis.window) {
    return globalThis.window as unknown as Window;
  }

  const window = new Window({ url: "http://localhost/" });
  const document = window.document;
  const globals = globalThis as typeof globalThis & Record<string, unknown>;

  globals.window = window;
  globals.document = document;
  globals.navigator = window.navigator;
  globals.location = window.location;
  globals.history = window.history;
  globals.localStorage = window.localStorage;
  globals.sessionStorage = window.sessionStorage;
  globals.HTMLElement = window.HTMLElement;
  globals.Element = window.Element;
  globals.Node = window.Node;
  globals.Document = window.Document;
  globals.DocumentFragment = window.DocumentFragment;
  globals.Text = window.Text;
  globals.Comment = window.Comment;
  globals.Event = window.Event;
  globals.KeyboardEvent = window.KeyboardEvent;
  globals.MouseEvent = window.MouseEvent;
  globals.CustomEvent = window.CustomEvent;
  globals.MutationObserver = window.MutationObserver;
  globals.getComputedStyle = window.getComputedStyle.bind(window);
  globals.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globals.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globals.getSelection = window.getSelection.bind(window);
  globals.customElements = window.customElements;
  globals.DOMRect = window.DOMRect;

  registered = true;
  return window;
}
