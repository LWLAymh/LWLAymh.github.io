MathJax.Ajax.config.path["Contrib"] = "https://cdn.jsdelivr.net/gh/sonoisa/XyJax@master";

MathJax.Hub.Config({
  extensions: ["[Contrib]/xyjax.js"],
  jax: ["input/TeX", "output/HTML-CSS"],
  tex2jax: {
    inlineMath: [["$", "$"], ["\\(", "\\)"]],
    displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    skipTags: ["script", "noscript", "style", "textarea", "pre", "code"],
    processEscapes: true
  },
  TeX: {
    extensions: ["AMSmath.js", "AMSsymbols.js", "color.js"]
  }
});