// How blobatar.js was built (blobatar 2.7.0 from npm, MIT – see LICENSE). To update it:
//   npm pack blobatar && tar xzf blobatar-*.tgz          (unpacks to ./package)
//   npx esbuild entry.js --bundle --minify --format=iife --global-name=SellaBlob --loader:.css=text --outfile=blobatar.js
// with the imports below pointing at ./package/dist/… The widget (public/widget/prodavac.js) uses:
//   parts(name, opts) – the mascot's drawing and its motion variables, for a name and an expression
//   expressions       – idle, happy, thinking, surprised…
//   gaze(svg, opts)   – the eyes following the cursor
//   motionCss, gazeCss – the stylesheets that animate it (breathing, bobbing, blinking, glances)
export { _parts as parts, serializeVars } from "blobatar/internal";
export * as expressions from "blobatar/expression";
export { gaze } from "blobatar/gaze";
export { default as motionCss } from "blobatar/motion.css";
export { default as gazeCss } from "blobatar/gaze.css";
