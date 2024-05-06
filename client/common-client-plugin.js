function register ({ registerHook, registerVideoField }) {
    const commonOptions = {
      name: 'transmux-m4a',
      label: 'Transmux Audio To M4A',
      type: 'input-checkbox'
    }
	const commonOptions2 = {
		name: 'episode-number',
		label: 'Episode Number',
		type: 'input',
		default: '',
	}
    for (const type of [ 'upload', 'import-url', 'update' ]) {
		registerVideoField(commonOptions, { type, tab: 'main' })
		registerVideoField(commonOptions2, { type, tab: 'main' })
	}
}

export {
  register
}
