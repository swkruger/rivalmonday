/** Native <select>/<textarea> classes for GET forms and server forms (no JS): input.tsx's recipe. */
const controlRecipe =
  "min-w-0 rounded-sm border border-input bg-surface text-sm text-ink transition-colors outline-none placeholder:text-muted-ink disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-line-control disabled:bg-canvas disabled:text-muted-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger aria-invalid:ring-inset"

export const nativeSelectClass = `h-9 px-3 ${controlRecipe}`
export const textareaClass = `min-h-20 w-full px-3 py-2 ${controlRecipe}`
