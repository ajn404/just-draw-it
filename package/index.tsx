import { defineComponent, h } from 'vue';
import ComponentUtil from './utils/ComponentUtil';
import draw from './draw.vue';

export default ComponentUtil.withInstall(
  defineComponent({
    name: 'my-component',
    components:{draw,},
    setup() {
      return () => <draw/>
    }
  })
);