import { createApp } from 'vue';
import App from './App.vue';
import MyComponent from '../lib/my-component';
import '../lib/style.css'

const app = createApp(App);
app.use(MyComponent);

app.mount('#app');
