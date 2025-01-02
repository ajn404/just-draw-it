import { defineComponent, h, App } from 'vue';
import ComponentUtil from './utils/ComponentUtil';
import draw from './draw.vue';

const MyComponent = defineComponent({
  name: 'my-component',
  components: { draw },
  setup() {
    return () => <draw/>
  }
});

export default ComponentUtil.withInstall(MyComponent) as typeof MyComponent & {
  install(app: App): void;
};