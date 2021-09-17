/* eslint-disable no-new-func */
export const registry = []
export const directiveRegistry = []

export const expressionToJS = (str = '') => {
//   return '`' + str.replaceAll('{{', '${').replaceAll('}}', '}') + '`'
  return '`' + str.replaceAll('{{', '${this.').replaceAll('}}', '}') + '`'
}

const logError = console.warn

export const html = (a) => a.raw[0]

export const createRenderFn = (
  expression = ''
) => {
  const raw = expressionToJS(expression)
  const func = `return ${raw}`
  const fn = new Function(func)

  // https://github.com/slimjs/slim.js/blob/master/src/dom.js#L219
  return (scope = { }) => {
    try {
      // Create Special *item* shortcut
      scope.item = scope.item || scope
      const response = fn.call(scope)
      return response
    } catch (err) {
      logError(
        `Expression error: ${expression}`,
        err.message,
        'Scope',
        scope,
        'Function: \n',
        func
        // "Node",
        //   targetNode.parentElement
      )
    }
  }
}

// TEST
// console.log(
//   createRenderFn('<h1>Hello, {{who}} !</h1>')({ who: 'Me' })
// )

// console.log(
//   createRenderFn('<h1>Hello, {{user.name}} !</h1>')({ user: { name: 'John' } })
// )

// console.log(
//   createRenderFn('<h1>Hello, {{who}} !</h1>')({ who: 'Me' })
// )

// console.log(
//   createRenderFn('{{item.amount}} - {{item.title}} - {{item.price}} USD')({ amount: 10, title: 'Apple', price: 20 })
// )

/**
 * Directives
 */

/**
 * Directive: *for
 */
directiveRegistry.push({
  match: (_, attributes) => {
    return attributes.find(v => v.nodeName === '*for')
  },
  //   attribute: (_, name) => name === '*foreach',
  process: (ctx) => {
    const { targetNode } = ctx

    // console.log(ctx)

    // TODO expressionToJs
    const items = ctx.props[ctx.attributeValue]

    const update = (value) => {
      // const parent = targetNode.parentNode
      const referenceNode = null

      // Add Comment
      //   const hook = document.createComment('*foreach')
      //   parent.insertBefore(hook, referenceNode)

      // Add items
      items.forEach((item, idx) => {
        // # Create template node
        const newNode = targetNode.cloneNode(true)
        // Remove directive
        newNode.removeAttribute('*for')

        // Debug
        newNode.setAttribute('item', JSON.stringify(item))

        // Add node
        targetNode.parentNode.insertBefore(newNode, referenceNode)
      })

      // Remove template node
    //   targetNode.remove()
    }

    return {
      update
    }
  }
})

/**
 * Event directive
 * Based on https://github.com/slimjs/slim.js/blob/master/src/directives/event.directive.js
 */
directiveRegistry.push({
  match: (_, attributes) => {
    return attributes.find(v => v.nodeName.startsWith('@'))
  },
  process: (ctx) => {
    const { targetNode, attributeName } = ctx

    const expression = ctx.attributeValue

    const eventHandler = function (event) {
      const fn = new Function('event', 'item', `return ${expression};`)
      // MOCK
      // const scope = {
      //   list: []
      // }
      const scope = ctx.props

      try {
        // Create Special *item* shortcut
        // scope.item = scope.item || scope
        fn.call(scope)
        console.log(ctx)

        // Trigger update ?
        ctx.scopeNode.render()
      } catch (err) {
        logError(
          `Expression error: ${expression}`,
          err.message,
          'Scope',
          scope
        )
      }
    }

    // Attach
    const eventName = attributeName.slice(1)
    targetNode.addEventListener(eventName, eventHandler)
    return {
      removeAttribute: true
    }
  }
})

export const processDOM = (scope, dom, { _directiveRegistry = directiveRegistry } = {}) => {
  // Based on https://github.com/slimjs/slim.js/blob/master/src/dom.js
  const walkerFilter = NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT

  const createWalker = (target) =>
    document.createTreeWalker(target, walkerFilter)

  const walker = createWalker(dom)

  let currentNode = walker.currentNode

  const processElementNode = (targetNode) => {
    const attributes = Array.from(targetNode.attributes)

    // Process directives
    _directiveRegistry.forEach(directive => {
      // Is a match?
      const match = directive.match(currentNode, attributes)

      if (!match) return

      const directiveResponse = directive.process({
        attributeValue: match.nodeValue,
        attributeName: match.nodeName,
        scopeNode: scope,
        targetNode,
        attributes,
        // expression: scope.data[expr],
        props: scope.data
        // item: scope.data[expr]
      })
      const {
        update
      } = directiveResponse

      // Run update
      if (update) {
        update()
      }
    })
  }

  const processTextNode = (currentNode) => {
    const expression = currentNode.textContent

    // Skip if not a template
    if (!~expression.indexOf('{{')) return

    // TODO
    // const data = {
    //   item: {
    //     amount: 10, title: 'Apple', price: 20
    //   }
    // }
    // const data = currentNode.parentNode
    // const data = {}
    // console.log(currentNode.parentNode.getAttribute('item'))
    const data = JSON.parse(currentNode.parentNode.getAttribute('item'))

    const innerHTML = createRenderFn(expression)(data)

    // Replace content
    currentNode.textContent = innerHTML
  }

  // Walk each node
  while (currentNode) {
    if (currentNode.nodeType === Node.ELEMENT_NODE) {
      processElementNode(currentNode)
    }

    if (currentNode.nodeType === Node.TEXT_NODE) {
      processTextNode(currentNode)
    }

    currentNode = walker.nextNode()
  }

  console.log('DONE')

  return {
    flush: (...props) => {
    }
  }
}

/**
 * https://github.com/slimjs/slim.js/blob/master/src/component.js
 * The class extends HTMLElement and is an Autonomous Custom Element, thus supporting all native lifecycle callbacks (i.e. connectedCallback, disconnectedCallback). It also provides artifical lifecycle hooks such as onRender and onCreated.
 */
class CustomComponent extends HTMLElement {
  constructor () {
    super()

    this.template = 'mounting...'

    this.render = () => {
      const template = this.constructor.template

      // Convert to DOM node
      const tpl = document.createElement('template')
      tpl.innerHTML = template

      // Promise.resolve().then(() => {
      // Set Data
      const fn = this.constructor.setup
      const data = fn.call(this)
      this.data = data

      const node = tpl.content

      // const { flush } = processDOM(this, tpl.content)
      // flush()
      processDOM(this, tpl.content)

      // Call lifecycle hook
      this.onCreated()

      // Mount
      // shadow.appendChild(wrapper);
      this.appendChild(node)
      // })
    }

    // RENDER
    // requestAnimationFrame(() => this.render());
    this.render()
    // setTimeout(this.render, 100)
  }

  onBeforeCreated () {}

  onCreated () {}

  onAdded () {}

  onRemoved () {}

  onRender () {}

  connectedCallback () {
    this.onAdded()
    // PluginRegistry.exec(ADDED, this);
  }

  disconnectedCallback () {
    this.onRemoved()
    // PluginRegistry.exec(REMOVED, this);
  }
}

// https://github.com/slimjs/slim.js/blob/master/src/component.js
export const _element = (tag = '', template = '', setup = () => {}) => {
  // Add to registery
  registry.push(tag, template)

  const base = class extends CustomComponent {}
  base.template = template
  base.setup = setup

  customElements.define(tag, base)
}

const ELEMENT = { tag: '', template: '', setup: () => { } }

export const element = (obj = ELEMENT) => {
  const { tag, template, setup } = obj

  // Add to registery
  registry.push(tag, template)

  const base = class extends CustomComponent { }

  // Bind to CustomComponent
  base.template = template
  base.setup = setup || ELEMENT.setup

  customElements.define(tag, base)
}
