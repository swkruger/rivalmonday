/** Native <select>/<textarea> classes for GET forms and server forms (no JS): input.tsx's recipe. */
const controlBase =
  "min-w-0 rounded-sm border border-input bg-surface text-ink transition-colors outline-none placeholder:text-muted-ink disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger aria-invalid:ring-inset"
const controlRecipe = `text-sm ${controlBase}`

export const nativeSelectClass = `h-9 px-3 ${controlRecipe}`
/** Native text <input> in server forms: the select recipe has no chevron/appearance rule, so the same height and look apply. */
export const nativeInputClass = nativeSelectClass
export const textareaClass = `min-h-22 w-full px-3 py-2 ${controlRecipe}`
/** Filter-toolbar <select>/<input> (Changes, Ads, Reviews, Rankings): the same control as a form, so every field in the app is one height. */
export const toolbarControlClass = `h-9 px-3 ${controlRecipe}`
/** Native file <input>: the browser button looks like an outlined white button, one 36 px control height like every other field. */
export const fileInputClass =
  "text-sm text-ink file:mr-3 file:h-9 file:cursor-pointer file:rounded-sm file:border file:border-input file:bg-surface file:px-3 file:text-sm file:font-medium file:text-ink file:transition-colors hover:file:bg-canvas disabled:file:cursor-not-allowed"
