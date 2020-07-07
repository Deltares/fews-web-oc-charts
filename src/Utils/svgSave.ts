function appendCSS (cssText: string, element: Element) {
  const styleElement = document.createElement("style")
  styleElement.setAttribute("type","text/css")
  styleElement.innerHTML = cssText
  const refNode = element.hasChildNodes() ? element.children[0] : null
  element.insertBefore(styleElement, refNode)
}

function getCssSelectors(element: Element) {
  let cssSelectors = []

  // Add Parent element Id and Classes to the list
  cssSelectors.push( '#'+element.id )
  element.classList.forEach( (cssClass) => {
    const classSelector = `.${cssClass}`
    if (!cssSelectors.includes(classSelector)) {
      cssSelectors.push(classSelector)
    }
  })

  // Add Children element Ids and Classes to the list
  const childElements = element.getElementsByTagName("*")
  for (let i=0; i < childElements.length; i++) {
    let id = childElements[i].id
    const idSelector = `#${id}`
    if (!cssSelectors.includes(idSelector)) {
      cssSelectors.push(idSelector)
    }

    childElements[i].classList.forEach( (cssClass) => {
      const classSelector = `.${cssClass}`
      if (!cssSelectors.includes(classSelector)) {
        cssSelectors.push(classSelector)
      }
    })
  }
  return cssSelectors
}

function getCssStyles (element: Element) {
  const cssSelectors = getCssSelectors(element)
  const cssRulesText = getCssRulesText(cssSelectors)
  return cssRulesText
}

function getCssRulesText (cssSelectors: string[] ) {
  let cssRulesText = ''
  for (let i=0; i < document.styleSheets.length; i++) {
    const s = document.styleSheets[i] as any
    if (s.disabled) continue
    try {
      if(!s.cssRules) continue
    } catch( e ) {
      if(e.name !== 'SecurityError') throw e // for Firefox
      continue
    }
    for (let rule of s.cssRules) {
      if ( cssSelectors.includes(rule.selectorText) ) {
        cssRulesText += rule.cssText
      }
    }
  }
  return cssRulesText
}

export function getSvgAsString( svgElement: SVGElement ) {
	svgElement.setAttribute('xlink', 'http://www.w3.org/1999/xlink')
	let cssStyleText = getCssStyles( svgElement )
  appendCSS( cssStyleText, svgElement )

	let serializer = new XMLSerializer()
	let svgString = serializer.serializeToString(svgElement)
	svgString = svgString.replace(/(\w+)?:?xlink=/g, 'xmlns:xlink=') // Fix root xlink without namespace
	svgString = svgString.replace(/NS\d+:href/g, 'xlink:href') // Safari NS namespace fix
	return svgString
}

export function svgStringToImage(svgString: string, width: number, height: number, callback: Function ) {
	let imageSource = 'data:image/svg+xml;base64,'+ btoa( unescape( encodeURIComponent( svgString ) ) ) // Convert SVG string to data URL
	let canvas = document.createElement("canvas")
	const context = canvas.getContext("2d")

	canvas.width = width
	canvas.height = height

  if ( context !== null) {
    const image = new Image()
    image.onload = () => {
      context.clearRect ( 0, 0, width, height )
      context.drawImage(image, 0, 0, width, height)

      canvas.toBlob( function(blob) {
        if (blob !== null) {
          const fileSize = Math.round( blob.size/1024 ) + ' KB'
          // if (callback) callback( blob, fileSize)
          let svgUrl = URL.createObjectURL(blob);
          let downloadLink = document.createElement("a");
          downloadLink.href = svgUrl;
          downloadLink.download = `${name}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
      })
    }
    image.src = imageSource
  }
}

// export function saveSvgAsPng(svgElement: SVGElement) {
//   const bbox = svgElement.getBoundingClientRect()
//   let svgString = getSvgAsString(svgElement)
//   svgStringToImage( svgString, 2*bbox.width, 2*bbox.height, save ) // passes Blob and filesize String to the callback

//   function save( dataBlob: Blob, filesize: number ){
//     saveAs( dataBlob, 'test.png' ) // FileSaver.js function
//   }
// }

