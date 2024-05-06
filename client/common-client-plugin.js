function register ({ registerHook, registerVideoField }) {
    const commonOptions = {
      name: 'transmux-m4a',
      label: 'Transmux Audio To M4A',
      type: 'input-checkbox',
	  default: true,
    }
	const commonOptions2 = {
		name: 'episode-number',
		label: 'Episode Number',
		type: 'input',
		default: '',
	}
	const commonOptions3 = {
		name: 'episode-premiere',
		label: 'Episode Premiere Date',
		type: 'input',
		default: new Date().toLocaleString(),
	}
    for (const type of [ 'upload', 'import-url', 'update' ]) {
		registerVideoField(commonOptions, { type, tab: 'main' })
		registerVideoField(commonOptions2, { type, tab: 'main' })
		registerVideoField(commonOptions3, { type, tab: 'main' })
	}
}

export {
  register
}
