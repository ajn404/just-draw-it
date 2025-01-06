
## just draw it

![](https://github.com/ajn404/just-draw-it/blob/main/screenshoot.png)

## how to use 

```bash
npm i just-draw-it
```

global

```ts
import { createApp } from 'vue';
import App from './App.vue';
import MyComponent from 'just-draw-it';
import 'just-draw-it/lib/style.css'

const app = createApp(App);
app.use(MyComponent);

app.mount('#app');

```

App.vue

```vue
<template>
  <my-component />
</template>
```

use in component

```vue
<script setup lang="ts">
import MyComponent from 'just-draw-it';
import 'just-draw-it/lib/style.css'

</script>

<template>
  <my-component />
</template>

```
