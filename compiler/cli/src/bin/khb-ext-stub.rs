//! A minimal `khb` extension, used only by the extension integration test (built behind
//! the `ext-stub` feature). It implements the JSON-over-stdio protocol from
//! `docs/authoring/extensions.md`: read the request on stdin, write a generated `out.svg`
//! into the provided scratch dir, and echo the block body plus a reference to that image.
//! If `meta` names a file, it reads that file **relative to its working directory** (which
//! the compiler sets to the page's own directory) and includes its contents — exercising
//! page-relative path resolution.

use std::io::Read;
use std::path::Path;

fn main() {
    let mut input = String::new();
    std::io::stdin()
        .read_to_string(&mut input)
        .expect("read stdin");
    let req: serde_json::Value = serde_json::from_str(&input).expect("parse request JSON");

    let body = req["body"].as_str().unwrap_or_default();
    let meta = req["meta"].as_str().unwrap_or_default();
    let assets_dir = req["assets_dir"].as_str().expect("assets_dir");
    let asset_prefix = req["asset_prefix"].as_str().expect("asset_prefix");

    // Emit a tiny "visualization" into the scratch dir the compiler handed us.
    std::fs::write(
        Path::new(assets_dir).join("out.svg"),
        b"<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'/>",
    )
    .expect("write out.svg");

    // If the block passed a file path in `meta`, read it relative to the cwd (the page's
    // directory) and include its contents — proving page-relative path resolution.
    let included = if meta.is_empty() {
        String::new()
    } else {
        let contents = std::fs::read_to_string(meta)
            .unwrap_or_else(|e| panic!("reading `{meta}` from cwd: {e}"));
        format!("\n\nIncluded from `{meta}`:\n\n```\n{contents}```\n")
    };

    // Return Markdown showing the source and the generated image.
    let markdown = format!(
        "**Compiled label:**\n\n```\n{body}```{included}\n\n![label]({asset_prefix}out.svg)\n"
    );
    let response = serde_json::json!({
        "markdown": markdown,
        "assets": [ { "file": "out.svg" } ],
    });
    println!("{response}");
}
