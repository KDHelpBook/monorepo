//! Print the code-block syntax-highlighting stylesheet (light + dark) to stdout.
//!
//! Regenerates the CSS the viewer injects into the content iframe, matching the
//! classes the compiler's highlighter emits. Run after changing the themes:
//!
//! ```sh
//! cargo run -p kdhelp-core --example syntax-css > viewer-ts/src/styles/syntax.css
//! ```

fn main() {
    print!("{}", kdhelp_core::markdown::syntax_theme_css());
}
