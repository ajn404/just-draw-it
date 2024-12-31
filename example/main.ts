import { createApp } from 'vue';
import App from './App.vue';
import MyComponent from '../lib/index.ts';

const app = createApp(App);
app.use(MyComponent);

app.mount('#app');
