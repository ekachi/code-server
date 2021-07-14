import { getOptions, Options } from "../../common/util"
import "../register"

// TODO@jsjoeio: Add proper types.
type FixMeLater = any

// NOTE@jsjoeio
// This lives here ../../../lib/vscode/src/vs/base/common/platform.ts#L106
export const nlsConfigElementId = "vscode-remote-nls-configuration"

type NlsConfiguration = {
  locale: string
  availableLanguages: { [key: string]: string } | {}
  _languagePackId?: string
  _translationsConfigFile?: string
  _cacheRoot?: string
  _resolvedLanguagePackCoreLocation?: string
  _corruptedFile?: string
  _languagePackSupport?: boolean
  loadBundle?: FixMeLater
}

/**
 * A helper function to get the NLS Configuration settings.
 *
 * This is used by VSCode for localizations (i.e. changing
 * the display language).
 *
 * Make sure to wrap this in a try/catch block when you call it.
 **/
export function getNlsConfiguration(document: Document) {
  const errorMsgPrefix = "[vscode]"
  const nlsConfigElement = document?.getElementById(nlsConfigElementId)
  const nlsConfig = nlsConfigElement?.getAttribute("data-settings")

  if (!document) {
    throw new Error(`${errorMsgPrefix} Could not parse NLS configuration. document is undefined.`)
  }

  if (!nlsConfigElement) {
    throw new Error(
      `${errorMsgPrefix} Could not parse NLS configuration. Could not find nlsConfigElement with id: ${nlsConfigElementId}`,
    )
  }

  if (!nlsConfig) {
    throw new Error(
      `${errorMsgPrefix} Could not parse NLS configuration. Found nlsConfigElement but missing data-settings attribute.`,
    )
  }

  return JSON.parse(nlsConfig) as NlsConfiguration
}

type GetLoaderParams = {
  origin: string
  nlsConfig: NlsConfiguration
  options: Options
}

/**
 * Link to types in the loader source repo
 * https://github.com/microsoft/vscode-loader/blob/main/src/loader.d.ts#L280
 */
type Loader = {
  baseUrl: string
  recordStats: boolean
  // TODO@jsjoeio: There don't appear to be any types for trustedTypes yet.
  trustedTypesPolicy: FixMeLater
  paths: {
    [key: string]: string
  }
  "vs/nls": NlsConfiguration
}

/**
 * A helper function to get the require loader
 *
 * This used by VSCode/code-server
 * to load files.
 *
 * We extracted the logic into a function so that
 * it's easier to test.
 **/
export function getConfigurationForLoader({ origin, nlsConfig, options }: GetLoaderParams) {
  const loader: Loader = {
    // Without the full URL VS Code will try to load file://.
    baseUrl: `${origin}${options.csStaticBase}/lib/vscode/out`,
    recordStats: true,
    trustedTypesPolicy: (window as FixMeLater).trustedTypes?.createPolicy("amdLoader", {
      createScriptURL(value: string): string {
        if (value.startsWith(window.location.origin)) {
          return value
        }
        throw new Error(`Invalid script url: ${value}`)
      },
    }),
    paths: {
      "vscode-textmate": `../node_modules/vscode-textmate/release/main`,
      "vscode-oniguruma": `../node_modules/vscode-oniguruma/release/main`,
      xterm: `../node_modules/xterm/lib/xterm.js`,
      "xterm-addon-search": `../node_modules/xterm-addon-search/lib/xterm-addon-search.js`,
      "xterm-addon-unicode11": `../node_modules/xterm-addon-unicode11/lib/xterm-addon-unicode11.js`,
      "xterm-addon-webgl": `../node_modules/xterm-addon-webgl/lib/xterm-addon-webgl.js`,
      "tas-client-umd": `../node_modules/tas-client-umd/lib/tas-client-umd.js`,
      "iconv-lite-umd": `../node_modules/iconv-lite-umd/lib/iconv-lite-umd.js`,
      jschardet: `../node_modules/jschardet/dist/jschardet.min.js`,
    },
    "vs/nls": nlsConfig,
  }

  return loader
}

/**
 * Sets the body background color to match the theme.
 */
export function setBodyBackgroundToThemeBackgroundColor(document: Document, localStorage: Storage) {
  const errorMsgPrefix = "[vscode]"

  if (!document) {
    throw new Error(`${errorMsgPrefix} Could not set body background to theme background color. Document is undefined.`)
  }

  if (!localStorage) {
    throw new Error(
      `${errorMsgPrefix} Could not set body background to theme background color. localStorage is undefined.`,
    )
  }

  const colorThemeData = localStorage.getItem("colorThemeData")

  if (!colorThemeData) {
    throw new Error(
      `${errorMsgPrefix} Could not set body background to theme background color. Could not find colorThemeData in localStorage.`,
    )
  }

  let _colorThemeData
  try {
    // We wrap this JSON.parse logic in a try/catch
    // because it can throw if the JSON is invalid.
    // and instead of throwing a random error
    // we can throw our own error, which will be more helpful
    // to the end user.
    _colorThemeData = JSON.parse(colorThemeData)
  } catch {
    throw new Error(
      `${errorMsgPrefix} Could not set body background to theme background color. Could not parse colorThemeData from localStorage.`,
    )
  }

  const hasColorMapProperty = Object.prototype.hasOwnProperty.call(_colorThemeData, "colorMap")
  if (!hasColorMapProperty) {
    throw new Error(
      `${errorMsgPrefix} Could not set body background to theme background color. colorThemeData is missing colorMap.`,
    )
  }

  const editorBgColor = _colorThemeData.colorMap["editor.background"]

  if (!editorBgColor) {
    throw new Error(
      `${errorMsgPrefix} Could not set body background to theme background color. colorThemeData.colorMap["editor.background"] is undefined.`,
    )
  }

  document.body.style.background = editorBgColor

  return null
}

export function registerLoadBundleOnNlsConfig(nlsConfig: NlsConfiguration, base: string) {
  // NOTE@jsjoeio
  // Not sure why we use Object.create(null) instead of {}
  // They are not the same
  // See: https://stackoverflow.com/a/15518712/3015595
  // We copied this from ../../../lib/vscode/src/bootstrap.js#L143
  const bundles: {
    [key: string]: string
  } = Object.create(null)

  type LoadBundleCallback = (_: undefined, result?: string) => void

  nlsConfig.loadBundle = (bundle: string, _language: string, cb: LoadBundleCallback): void => {
    const result = bundles[bundle]
    if (result) {
      return cb(undefined, result)
    }
    // FIXME: Only works if path separators are /.
    const path = nlsConfig._resolvedLanguagePackCoreLocation + "/" + bundle.replace(/\//g, "!") + ".nls.json"
    fetch(`${base}/vscode/resource/?path=${encodeURIComponent(path)}`)
      .then((response) => response.json())
      .then((json) => {
        bundles[bundle] = json
        cb(undefined, json)
      })
      .catch(cb)
  }
}

/**
 * A helper function to encapsulate all the
 * logic used in this file.
 *
 * We purposely include all of this in a single function
 * so that it's easier to test.
 */
export function main() {
  const options = getOptions()
  const nlsConfig = getNlsConfiguration(document)

  if (nlsConfig._resolvedLanguagePackCoreLocation) {
    registerLoadBundleOnNlsConfig(nlsConfig, options.base)
  }

  const loader = getConfigurationForLoader({
    nlsConfig,
    options,
    origin: window.location.origin,
  })

  // TODO@jsjoeio
  // I'm not sure how to properly type cast this
  // This might be our best bet
  // Source: https://stackoverflow.com/a/30740935
  // This object on self.require is what configures the loader
  // and tells it how to load files that get imported.
  ;(self.require as FixMeLater) = loader

  setBodyBackgroundToThemeBackgroundColor(document, localStorage)
}

try {
  main()
} catch (error) {
  console.error(error)
}
