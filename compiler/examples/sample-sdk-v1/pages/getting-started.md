---
title: Getting Started
keywords: [install, quickstart]
categories: [guide]
---
# Getting Started

Install the 1.0 package and open a connection:

```js
import { connect } from "sample-sdk";
const client = connect("wss://example.test");
client.send({ hello: "world" });
```

`send()` is synchronous and returns nothing.
