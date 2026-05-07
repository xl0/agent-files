---
name: svelte-state-classes
description: How to manage state in Svelte 5
---

Manage state with classes using `$state` runes. Instantiation file must be `.svelte.ts`.

```ts
export class ChatStateClass {
	messages = $state<Message[]>([]);
	isLoading = $state(false);

	sendMessage = (message: string) => {
		this.isLoading = true;
		this.messages.push({ role: 'user', content: message, id: crypto.randomUUID() });

		setTimeout(() => {
			this.messages.push({ role: 'assistant', content: '...', id: crypto.randomUUID() });
			this.isLoading = false;
		}, 400);
	};
}
```

Context pattern for sharing state across components:

```ts
export class ToastState {
	toasts = $state<Toast[]>([]);
	private timeouts = new Map<string, number>();

	constructor() {
		onDestroy(() => {
			for (const t of this.timeouts.values()) clearTimeout(t);
			this.timeouts.clear();
		});
	}

	add(title: string, message: string, durationMs = 5000) {
		const id = crypto.randomUUID();
		this.toasts.push({ id, title, message });
		this.timeouts.set(id, setTimeout(() => this.remove(id), durationMs));
	}

	remove(id: string) {
		const timeout = this.timeouts.get(id);
		if (timeout) { clearTimeout(timeout); this.timeouts.delete(id); }
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}
}

const KEY = Symbol('TOAST');
export const setToastState = () => setContext(KEY, new ToastState());
export const getToastState = () => getContext<ToastState>(KEY);
```
