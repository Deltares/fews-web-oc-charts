/**
 * Adds a click event listener to element with the specified id.
 * @param {string} id - The id of the element to add the listener to.
 * @param {string} eventType - The type of event to listen for (e.g., 'click', 'mouseover').
 * @param {Function} listenerFunction - The function to be executed when the event is triggered.
 */
export function addListenerById<K extends keyof HTMLElementEventMap>(
  id: string,
  eventType: K,
  listenerFunction: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions,
): void {
  const element = document.getElementById(id)

  if (element) {
    element.addEventListener(eventType, listenerFunction as EventListener, options)
  } else {
    console.warn(`No element found with ID: ${id}`)
  }
}

/**
 * Adds a click event listener to elements with the specified class name.
 * @param {string} className - The class name of the elements to add the listener to.
 * @param {string} eventType - The type of event to listen for (e.g., 'click', 'mouseover').
 * @param {Function} listenerFunction - The function to be executed when the event is triggered.
 */
export function addListenerByClassName<
  K extends keyof HTMLElementEventMap
>(
  className: string,
  eventType: K,
  listenerFunction: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
): void {
  const elements = document.getElementsByClassName(className);

  for (let i = 0; i < elements.length; i++) {
    // TypeScript only knows this as Element, so cast to HTMLElement:
    const element = elements[i] as HTMLElement;
    element.addEventListener(eventType, listenerFunction as EventListener, options);
  }
}

