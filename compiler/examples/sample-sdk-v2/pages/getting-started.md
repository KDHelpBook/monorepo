---
title: Getting Started
keywords: [install, quickstart]
categories: [guide]
---
# Getting Started

Install the 2.0 package and await delivery:

```js
import { connect } from "sample-sdk";
const client = connect("wss://example.test");
await client.sendAsync({ hello: "world" }); // resolves once acknowledged
```
