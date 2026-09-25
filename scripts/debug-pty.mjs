import {createRequire} from 'node:module'

const require = createRequire(import.meta.url)
const pty = require('node-pty')

const shell = process.argv[2] || 'powershell.exe'
const useInit = process.argv[3] === 'init'
const INIT =
	'$__it_pb=(Get-Item function:prompt -EA SilentlyContinue).ScriptBlock;' +
	'function global:prompt{' +
	"try{[Console]::Write([char]27+']7;file://localhost/'+[uri]::EscapeDataString($PWD.Path)+[char]7)}catch{};" +
	"if($__it_pb){&$__it_pb}else{'PS '+$PWD.Path+'> '}}"

const args = useInit ? ['-NoLogo', '-NoExit', '-Command', INIT] : ['-NoLogo']
console.log('shell:', shell, 'init:', useInit)
let out = ''
const p = pty.spawn(shell, args, {
	name: 'xterm-256color',
	cols: 80,
	rows: 24,
	cwd: 'D:\\repos\\involvex\\involvex-term',
})
p.onData(d => {
	out += d
})
setTimeout(() => {
	console.log('OUTLEN:', out.length)
	console.log('SAMPLE:', JSON.stringify(out.slice(0, 300)))
	console.log('HAS_OSC7:', out.includes(']7;file://'))
	p.kill()
	process.exit(0)
}, 10000)
