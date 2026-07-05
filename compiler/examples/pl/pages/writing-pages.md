---
title: Pisanie stron
keywords: [Markdown, frontmatter, strony, redagowanie]
categories: [authoring]
---
# Pisanie stron

Każda strona to plik Markdown z małym blokiem **frontmatter** w YAML:

```yaml
---
title: Moja strona
keywords: [przykład, temat]
categories: [authoring]
---
# Moja strona

Treść w **Markdown**…
```

`id` domyślnie pochodzi od nazwy pliku, a `title` — z pierwszego nagłówka `#`.
`keywords` zasilają indeks, a `categories` przypisują stronę do facetu.

## Możliwości Markdown

Standardowy Markdown plus tabele, listy zadań, przekreślenia i autolinki. Bloki
kodu renderują się czcionką o stałej szerokości:

```rust
fn main() {
    println!("Pozdrowienia z docsetu!");
}
```

Strony łączysz odnośnikiem `#id`, np. [Kategorie](#categories).
