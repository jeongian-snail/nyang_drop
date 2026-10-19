export default {
  extends: ['stylelint-config-recommended'],
  rules: {
    // Separate components and responsive overrides need not follow global specificity order.
    'no-descending-specificity': null,
    'selector-class-pattern': '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    'custom-property-pattern': '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
    'keyframes-name-pattern': '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
  },
};
