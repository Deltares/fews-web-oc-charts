/**
 * Adds a click event listener to element with the specified id.
 * @param {string} id - The id of the element to add the listener to.
 * @param {string} eventType - The type of event to listen for (e.g., 'click', 'mouseover').
 * @param {Function} listenerFunction - The function to be executed when the event is triggered.
 */
export function addListenerById(id, eventType, listenerFunction) {
  const buttons = document.getElementById(id)
  buttons.addEventListener(eventType, (event) => listenerFunction(event))
}

/**
 * Adds a click event listener to elements with the specified class name.
 * @param {string} className - The class name of the elements to add the listener to.
 * @param {string} eventType - The type of event to listen for (e.g., 'click', 'mouseover').
 * @param {Function} listenerFunction - The function to be executed when the event is triggered.
 */
export function addListenerByClassName(className, eventType, listenerFunction) {
  const buttons = document.getElementsByClassName(className)
  for (let i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener(eventType, (event) => listenerFunction(event))
  }
}
