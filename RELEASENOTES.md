## Release Notes for oraclejet-tooling ##

### 21.0.0
* Hardened the vendored DOM parser against prototype pollution when copying object properties.
* Removed unsupported legacy theme staging, renaming, Sass, SVG, and webpack fallback handling. The default theme remains redwood, and stable remains supported when configured.
* Updated svgo version to 4.0.1
* Replaced `extract-zip` with `adm-zip` 0.6.0 and added staged, validated Exchange component archive extraction to prevent traversal and symbolic-link writes.
* Fixed Windows process spawning for package manager commands while preserving the shell-disabled, structured-argument security hardening.
* Security tightening: Exchange component install responses now validate component names, versions, and pack entries before applying project file or configuration changes.
* Security tightening: hook entries in `scripts/hooks/hooks.json` must now resolve to files under the project's `scripts/hooks/` directory. Absolute hook paths, parent traversal outside `scripts/hooks/`, non-string hook paths, and paths that resolve to the hooks directory itself are ignored and not executed.
* Security tightening: Reference component npm installs derived from downloaded Exchange metadata now require explicit approval in interactive environments and are blocked by default in non-interactive environments unless explicitly allowed. These installs now also validate package metadata and use `--ignore-scripts`.
* Security tightening: programmatic `ojet.serve()` watch configuration now rejects unknown string commands. Built-in commands such as `compileSass` and `copyThemes` may still be strings, but custom commands must use structured command objects and are run without shell interpretation, for example `commands: [{ cmd: 'npm', args: ['run', 'generate-docs'] }]` instead of `commands: ['npm run generate-docs']`.
* Security tightening: serve defaults now bind to `127.0.0.1`, and directory listing is disabled unless explicitly enabled through serve/connect options. CLI users can intentionally expose the development server or enable directory listing from a trusted `before_serve` hook by setting `connectOpts.hostname` or `connectOpts.directoryListing`.

### 20.1.3
* Hardened the vendored DOM parser against prototype pollution when copying object properties.
* Replaced extract-zip with adm-zip 0.6.0 and added staged, validated Exchange component archive extraction to prevent traversal and symbolic-link writes.

### 20.1.2
* Security tightening: hook entries in scripts/hooks/hooks.json must now resolve to files under the project's scripts/hooks/ directory. Absolute hook paths, parent traversal outside scripts/hooks/, non-string hook paths, and paths that resolve to the hooks directory itself are ignored and not executed.
* Updated extract-zip dependency to 2.0.1.
* Fixed Windows process spawning for package manager commands while preserving the shell-disabled, structured-argument security hardening.
* Security tightening: Exchange component install responses now validate component names, versions, and pack entries before applying project file or configuration changes.

### 20.1.1
* Reference component npm installs derived from downloaded Exchange metadata now require explicit approval in interactive environments and are blocked by default in non-interactive environments unless explicitly allowed. These installs now also validate package metadata and use `--ignore-scripts`.
* Security tightening: programmatic `ojet.serve()` watch configuration now rejects unknown string commands. Built-in commands such as `compileSass` and `copyThemes` may still be strings, but custom commands must use structured command objects and are run without shell interpretation, for example `commands: [{ cmd: 'npm', args: ['run', 'generate-docs'] }]` instead of `commands: ['npm run generate-docs']`.
* Security tightening: serve defaults now bind to `127.0.0.1`, and directory listing is disabled unless explicitly enabled through serve/connect options. CLI users can intentionally expose the development server or enable directory listing from a trusted `before_serve` hook by setting `connectOpts.hostname` or `connectOpts.directoryListing`.

### 20.1.0
* Updated svgo version to 4.0.1

### 20.0.4
* Hardened the vendored DOM parser against prototype pollution when copying object properties.
* Replaced extract-zip with adm-zip 0.6.0 and added staged, validated Exchange component archive extraction to prevent traversal and symbolic-link writes.

### 20.0.3
* Security tightening: hook entries in scripts/hooks/hooks.json must now resolve to files under the project's scripts/hooks/ directory. Absolute hook paths, parent traversal outside scripts/hooks/, non-string hook paths, and paths that resolve to the hooks directory itself are ignored and not executed.
* Updated extract-zip dependency to 2.0.1.
* Fixed Windows process spawning for package manager commands while preserving the shell-disabled, structured-argument security hardening.
* Security tightening: Exchange component install responses now validate component names, versions, and pack entries before applying project file or configuration changes.

### 20.0.2
* Reference component npm installs derived from downloaded Exchange metadata now require explicit approval in interactive environments and are blocked by default in non-interactive environments unless explicitly allowed. These installs now also validate package metadata and use `--ignore-scripts`.
* Security tightening: programmatic `ojet.serve()` watch configuration now rejects unknown string commands. Built-in commands such as `compileSass` and `copyThemes` may still be strings, but custom commands must use structured command objects and are run without shell interpretation, for example `commands: [{ cmd: 'npm', args: ['run', 'generate-docs'] }]` instead of `commands: ['npm run generate-docs']`.
* Security tightening: serve defaults now bind to `127.0.0.1`, and directory listing is disabled unless explicitly enabled through serve/connect options. CLI users can intentionally expose the development server or enable directory listing from a trusted `before_serve` hook by setting `connectOpts.hostname` or `connectOpts.directoryListing`.

### 20.0.1
* Updated svgo version to 4.0.1

### 20.0.0
* Updated glob version to 12.0.0
* Updated form-data version to 4.0.5

### 19.0.5
* Hardened the vendored DOM parser against prototype pollution when copying object properties.
* Replaced extract-zip with adm-zip 0.6.0 and added staged, validated Exchange component archive extraction to prevent traversal and symbolic-link writes.

### 19.0.4
* Security tightening: hook entries in scripts/hooks/hooks.json must now resolve to files under the project's scripts/hooks/ directory. Absolute hook paths, parent traversal outside scripts/hooks/, non-string hook paths, and paths that resolve to the hooks directory itself are ignored and not executed.
* Updated extract-zip dependency to 2.0.1.
* Fixed Windows process spawning for package manager commands while preserving the shell-disabled, structured-argument security hardening.
* Security tightening: Exchange component install responses now validate component names, versions, and pack entries before applying project file or configuration changes.

### 19.0.3
* Reference component npm installs derived from downloaded Exchange metadata now require explicit approval in interactive environments and are blocked by default in non-interactive environments unless explicitly allowed. These installs now also validate package metadata and use `--ignore-scripts`.
* Security tightening: programmatic `ojet.serve()` watch configuration now rejects unknown string commands. Built-in commands such as `compileSass` and `copyThemes` may still be strings, but custom commands must use structured command objects and are run without shell interpretation, for example `commands: [{ cmd: 'npm', args: ['run', 'generate-docs'] }]` instead of `commands: ['npm run generate-docs']`.
* Security tightening: serve defaults now bind to `127.0.0.1`, and directory listing is disabled unless explicitly enabled through serve/connect options. CLI users can intentionally expose the development server or enable directory listing from a trusted `before_serve` hook by setting `connectOpts.hostname` or `connectOpts.directoryListing`.

### 19.0.2
* Updated svgo version to 4.0.1

### 19.0.1
* Updated glob version to 12.0.0

### 18.1.3
* Reference component npm installs derived from downloaded Exchange metadata now require explicit approval in interactive environments and are blocked by default in non-interactive environments unless explicitly allowed. These installs now also validate package metadata and use `--ignore-scripts`.
* Security tightening: programmatic `ojet.serve()` watch configuration now rejects unknown string commands. Built-in commands such as `compileSass` and `copyThemes` may still be strings, but custom commands must use structured command objects and are run without shell interpretation, for example `commands: [{ cmd: 'npm', args: ['run', 'generate-docs'] }]` instead of `commands: ['npm run generate-docs']`.
* Security tightening: serve defaults now bind to `127.0.0.1`, and directory listing is disabled unless explicitly enabled through serve/connect options. CLI users can intentionally expose the development server or enable directory listing from a trusted `before_serve` hook by setting `connectOpts.hostname` or `connectOpts.directoryListing`.

### 18.1.2
* Updated svgo version to 4.0.1

### 18.1.1
* Updated glob version to 12.0.0

### 18.0.3
* Reference component npm installs derived from downloaded Exchange metadata now require explicit approval in interactive environments and are blocked by default in non-interactive environments unless explicitly allowed. These installs now also validate package metadata and use `--ignore-scripts`.
* Security tightening: programmatic `ojet.serve()` watch configuration now rejects unknown string commands. Built-in commands such as `compileSass` and `copyThemes` may still be strings, but custom commands must use structured command objects and are run without shell interpretation, for example `commands: [{ cmd: 'npm', args: ['run', 'generate-docs'] }]` instead of `commands: ['npm run generate-docs']`.
* Security tightening: serve defaults now bind to `127.0.0.1`, and directory listing is disabled unless explicitly enabled through serve/connect options. CLI users can intentionally expose the development server or enable directory listing from a trusted `before_serve` hook by setting `connectOpts.hostname` or `connectOpts.directoryListing`.

### 18.0.2
* Updated svgo version to 4.0.1

### 18.0.1
* Updated glob version to 12.0.0

### 18.0.0
* Switch to chokidar from gaze

### 17.1.1
* Updated glob version to 12.0.0

### 17.0.1
* Updated glob version to 12.0.0

### 11.0.0
* oraclejet-tooling now requires node 12.21 or later

### 5.2.0
* No changes

### 5.1.0
* No changes

### 5.0.0
* No changes

### 4.2.0
* No changes

### 4.1.0
* No changes

### 4.0.0
* Moved module into @oracle scope, changing the name to @oracle/oraclejet-tooling

### 3.2.0
* No changes

### 3.1.0
* No changes

### 3.0.0
* Replaced bower with npm
* SASS tasks now run in CCA directories also
* Added --destination=server-only option for web apps
* Removed --destination=deviceOrEmulatorName option
* Added ability to cutomize serve tasks such as watching additional files
* Added gap://ready to inserted CSP meta tag for iOS 10 compatibility

### 2.3.0
* No changes

### 2.2.0
* Allow developers to configure release paths
* Provide help page for tooling tasks
* Allow multiple themes to be included in a built app
* Grunt serve to specific iOS emulator fails
* no-build option missing from grunt serve
