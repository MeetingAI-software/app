const { isAbsolute } = require('node:path');
const { globSync: tinyGlobSync } = require('tinyglobby');

// Next only consumes globSync for configured project roots. Preserve fast-glob's
// literal-directory behavior without its vulnerable braces dependency.
function globSync(pattern, options) {
  return tinyGlobSync(pattern, { ...options, expandDirectories: false, absolute: options?.absolute ?? isAbsolute(pattern) }).map((directory) => {
    if (directory === '/' || /^[a-zA-Z]:\/$/.test(directory)) return directory;
    return directory.replace(/\/$/, '');
  });
}

module.exports = { globSync };
