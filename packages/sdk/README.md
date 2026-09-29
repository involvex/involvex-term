# @involvex/term-sdk

Type-only SDK for [Involvex-Term](https://github.com/involvex/involvex-term)
plugins. No runtime code — just editor intellisense for `PluginApi` /
`PluginModule` via JSDoc, so a plain `.mjs` plugin gets full autocomplete:

```js
/** @type {import('@involvex/term-sdk').PluginModule} */
export default {
	activate(api) {
		api.commands.register({id: 'hello.sayHi', title: 'Hello: say hi'}, () =>
			api.log('hi from a plugin!'),
		)
	},
}
```

See [`PLUGINS.md`](https://github.com/involvex/involvex-term/blob/main/PLUGINS.md)
for the full plugin guide and API reference.
