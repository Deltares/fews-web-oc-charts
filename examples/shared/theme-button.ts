export class ThemeButton extends HTMLElement {
  constructor() {
    super()
  }

  connectedCallback() {
    const labelText = this.getAttribute('label') ?? 'Toggle theme'

    const shadow = this.attachShadow({ mode: 'open' })
    const button = shadow.appendChild(document.createElement('input'))
    button.type = 'button'
    button.value = labelText

    button.addEventListener('click', () => this.toggleTheme())
  }

  private toggleTheme(): void {
    document.documentElement.classList.toggle('dark')
  }
}

customElements.define('theme-button', ThemeButton)
