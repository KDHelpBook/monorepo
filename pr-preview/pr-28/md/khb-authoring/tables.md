
# Tables

Pipe tables work exactly as on GitHub. The header row is
separated from the body by a row of dashes; colons in that separator set column
alignment.

~~~code-preview example
```md
| Prop  | Default | Type   |
|-------|:-------:|-------:|
| name  |         | string |
| size  | md      | string |
```
```md
| Prop  | Default | Type   |
|-------|:-------:|-------:|
| name  |         | string |
| size  | md      | string |
```
~~~

- `:---` left-aligns, `:--:` centres, `---:` right-aligns.
- Cells are inline Markdown, so `**bold**`, `` `code` `` and links work inside them.
- A wide table scrolls horizontally inside the content frame rather than breaking
  the layout.

There is no cell-spanning or nested-block syntax — tables are for tabular data;
reach for lists or headings for richer structure.
