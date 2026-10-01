// Chapters and puzzles. In `buf`, ▮ marks the cursor and ◎ marks the target
// position (cursor puzzles). A puzzle with `want` is solved when the text
// matches it in Normal mode. `sol` is the reference solution; its key count
// is the par. tests/levels.test.mjs replays every solution.
import { parseKeys } from './vim.js';

export const CHAPTERS = [
  {
    id: 'hjkl', name: '方向感', keys: ['h', 'j', 'k', 'l', '数字'], need: [],
    intro: '手指放在 hjkl 上：h 左、j 下、k 上、l 右。前面加数字就是走几步。',
    puzzles: [
      { t: '向右走到闪光的格子', buf: '▮go ◎on', sol: 'lll', tip: 'l 向右一格。' },
      { t: '向下两行', buf: '▮one\ntwo\n◎three', sol: 'jj', tip: 'j 像一个向下的钩子。' },
      { t: '上一行，再回到行首', buf: '◎a b c\nd e ▮f', sol: 'khhhh', tip: '先 k 上去，再 h 往左。' },
      { t: '一口气下到第 7 行', buf: '▮line 1\nline 2\nline 3\nline 4\nline 5\nline 6\n◎line 7', sol: '6j', tip: '数字 + 动作：6j 就是向下 6 行。' },
      { t: '数字也能配 l', buf: '▮let a = 1;\nlet b = 2;\nlet c = 3;\nlet sum ◎= a + b + c;', sol: '3j8l', tip: '3j 下到最后一行，8l 向右 8 格。' },
    ],
  },
  {
    id: 'word', name: '单词跳跃', keys: ['w', 'b', 'e', 'W', 'B'], need: ['hjkl'],
    intro: 'w 跳到下一个词的开头，b 跳回上一个词，e 跳到词尾。大写的 W B E 把连着的符号也当成一个词。',
    puzzles: [
      { t: '跳到 getUser', buf: '▮const user = ◎getUser();', sol: '3w', tip: 'www 也可以，3w 更省。等号也算一个“词”。' },
      { t: '停在 user 的最后一个字母', buf: '▮const use◎r = getUser();', sol: '2e', tip: 'e 去词尾，2e 去第二个词尾。' },
      { t: '往回跳到 user', buf: 'const ◎user = getUser(▮);', sol: '4b', tip: '括号 () 是一个符号词，b 也会停在那里。' },
      { t: '用 W 越过一整串', buf: '▮foo.bar(baz).qux ◎done', sol: 'W', tip: 'W 只认空格：foo.bar(baz).qux 是一个大词。' },
      { t: 'w 会自动换行', buf: '▮if ok:\n    ◎return x', sol: '3w', tip: '行尾不会挡住 w，它会继续去下一行。' },
    ],
  },
  {
    id: 'line', name: '行首行尾', keys: ['0', '^', '$', 'gg', 'G'], need: ['hjkl'],
    intro: '$ 到行尾，0 到行首，^ 到第一个非空字符。gg 回到第一行，G 去最后一行，5G 去第 5 行。',
    puzzles: [
      { t: '到行尾的分号', buf: '▮return a + b◎;', sol: '$', tip: '$ 在正则里也代表行尾。' },
      { t: '到代码的第一个字', buf: '    ◎const x = ▮1;', sol: '^', tip: '^ 跳过缩进，停在第一个非空字符。' },
      { t: '到真正的行首', buf: '◎    const x = ▮1;', sol: '0', tip: '0 不管缩进，直接到第 0 列。' },
      { t: '直达最后一行', buf: '▮import os\nimport sys\n\ndef main():\n    pass\n\n◎main()', sol: 'G', tip: 'G 去文件最后一行。' },
      { t: '跳到第 3 行', buf: 'a = 1\nb = 2\n    ◎c = a + b\nprint(c)\nprint(a)\nprint(▮b)', sol: '3G', tip: '3G 或 :3 都能去第 3 行。' },
      { t: '回到第一行的行尾', buf: 'title: Vim◎!\n\nbody...\nmore...\n▮end', sol: 'gg$', tip: 'gg 回顶部，再 $ 去行尾。' },
    ],
  },
  {
    id: 'find', name: '行内狙击', keys: ['f', 't', 'F', 'T', ';', ','], need: ['word'],
    intro: 'f 加一个字符，跳到这一行里它下一次出现的位置。t 停在它前一格。大写 F T 往左找。; 重复上一次，, 反方向重复。',
    puzzles: [
      { t: '跳到左括号', buf: '▮print◎(user.name)', sol: 'f(', tip: 'f( 就是 find (。' },
      { t: '跳到大于号', buf: '▮if (count ◎> max) {', sol: 'f>', tip: '目标字符在这一行里是唯一的，f 一下就到。' },
      { t: '停在分号前面', buf: '▮total = price * qt◎y;', sol: 't;', tip: 't 是 till：到它前面为止。' },
      { t: '往左找方括号', buf: 'items◎[index] = val▮ue;', sol: 'F[', tip: 'F 往左找。' },
      { t: '第三个乘号', buf: '▮x = a * b * c ◎* d', sol: '3f*', tip: '3f* 一步到位；f* 再按 ;; 也可以。' },
      { t: '往回找逗号', buf: 'f(a, b◎, c, d▮)', sol: '2F,', tip: 'F, 再按 ; 继续往左；2F, 更直接。' },
    ],
  },
  {
    id: 'insert', name: '开始写字', keys: ['i', 'a', 'I', 'A', 'o', 'O', 'Esc'], need: ['line'],
    intro: 'i 在光标前插入，a 在光标后。I 在行首、A 在行尾。o 在下面开新行，O 在上面。写完按 Esc 回到普通模式。',
    puzzles: [
      { t: '在 world 前面加上 Vim', buf: 'Hello ▮world', want: 'Hello Vim world', sol: 'iVim <Esc>', tip: 'i 在光标前插入，写完一定要 Esc。' },
      { t: '补上漏掉的 n', buf: 'pr▮it(x)', want: 'print(x)', sol: 'an<Esc>', tip: 'a 在光标后面插入。' },
      { t: '行尾补分号', buf: '▮let x = 1', want: 'let x = 1;', sol: 'A;<Esc>', tip: 'A 直接到行尾插入，光标在哪都行。' },
      { t: '把这行注释掉', buf: '    return ▮x', want: '    // return x', sol: 'I// <Esc>', tip: 'I 会跳过缩进，在第一个字前面插入。' },
      { t: '在下面加一项', buf: 'items = [\n    ▮"apple",\n]', want: 'items = [\n    "apple",\n    "pear",\n]', sol: 'o"pear",<Esc>', tip: 'o 开新行，并自动沿用缩进。' },
      { t: '在上面加注释', buf: '▮function add(a, b) {\n  return a + b;\n}', want: '// sum\nfunction add(a, b) {\n  return a + b;\n}', sol: 'O// sum<Esc>', tip: 'O 在上方开新行。' },
    ],
  },
  {
    id: 'delete', name: '删删删', keys: ['x', 'dd', 'D', 'dw', 'd{动作}'], need: ['insert'],
    intro: 'x 删一个字符，dd 删一整行，D 删到行尾。d 后面跟任何动作：dw 删一个词，dt) 删到右括号前。',
    puzzles: [
      { t: '多了一个 l', buf: 'Hel▮llo', want: 'Hello', sol: 'x', tip: 'x 就像橡皮擦。' },
      { t: '删掉中间那行', buf: 'a = 1\n▮DELETE ME\nb = 2', want: 'a = 1\nb = 2', sol: 'dd', tip: 'dd 删除整行。' },
      { t: '删掉两个多余的词', buf: 'print(▮very bad words)', want: 'print(words)', sol: 'd2w', tip: 'd2w：删除两个词。2dw 也一样。' },
      { t: '删掉行尾注释', buf: 'x = compute()▮  # TODO: remove', want: 'x = compute()', sol: 'D', tip: 'D 等于 d$，删到行尾。' },
      { t: '一次删三行', buf: 'keep\n▮debug 1\ndebug 2\ndebug 3\nkeep', want: 'keep\nkeep', sol: '3dd', tip: '数字 + dd，删几行都行。' },
      { t: '清空引号里的后半句', buf: 'message = "Hello, ▮World and everyone"', want: 'message = "Hello, "', sol: 'dt"', tip: 'dt" 删到引号之前，引号本身留着。' },
    ],
  },
  {
    id: 'change', name: '改头换面', keys: ['r', 'cw', 'C', 'cc', '~', 'gU'], need: ['delete'],
    intro: 'r 替换一个字符。c 是“删掉再进入插入模式”：cw 改一个词，C 改到行尾，cc 改整行。gU 把文字变大写。',
    puzzles: [
      { t: '把 5 改成 7', buf: 'let x = ▮5;', want: 'let x = 7;', sol: 'r7', tip: 'r 替换后自动回到普通模式，不用 Esc。' },
      { t: '把 foo 改名为 bar', buf: 'const ▮foo = 1;', want: 'const bar = 1;', sol: 'cwbar<Esc>', tip: 'cw = 删掉这个词并开始输入。' },
      { t: '后半行重写', buf: 'color = ▮red  // TODO', want: 'color = blue', sol: 'Cblue<Esc>', tip: 'C 删到行尾并插入。' },
      { t: '整行重写，保留缩进', buf: 'if x:\n    ▮print("debug")', want: 'if x:\n    return x', sol: 'ccreturn x<Esc>', tip: 'cc 改整行。本游戏开启了 autoindent，缩进会保留。' },
      { t: '首字母大写', buf: '▮hello', want: 'Hello', sol: '~', tip: '~ 切换一个字符的大小写。' },
      { t: '常量要全大写', buf: 'const ▮max_size = 10', want: 'const MAX_SIZE = 10', sol: 'gUw', tip: 'gU 是“变大写”操作符，后面跟 w。gu 是变小写。' },
    ],
  },
  {
    id: 'textobj', name: '文本对象', keys: ['iw', 'aw', 'i"', 'i(', 'i{', 'ap'], need: ['change'],
    intro: '在 d c y 后面用 i 或 a 选一个“对象”：iw 一个词，i" 引号里面，a( 连括号一起，ap 一整段。光标在对象里的任何位置都行。',
    puzzles: [
      { t: '把 price 改成 cost', buf: 'let total = pr▮ice * 2', want: 'let total = cost * 2', sol: 'ciwcost<Esc>', tip: 'ciw：change inner word，光标在词中间也行。' },
      { t: '换掉引号里的内容', buf: '▮msg = "Hello World"', want: 'msg = "Hi"', sol: 'ci"Hi<Esc>', tip: 'ci" 会自动找到这一行的引号。' },
      { t: '清空括号里的参数', buf: 'print(some, ▮args, here)', want: 'print()', sol: 'di(', tip: 'di( 也可以写成 dib。' },
      { t: '重写整个函数体', buf: 'fn main() {\n    ▮println!("old");\n    old();\n}', want: 'fn main() {\n    run();\n}', sol: 'ci{run();<Esc>', tip: 'ci{ 换掉大括号里的所有行。' },
      { t: '删掉重复的词', buf: 'I really ▮really like vim', want: 'I really like vim', sol: 'daw', tip: 'aw 会把后面的空格一起带走。' },
      { t: '删掉中间那一段', buf: 'para one\nline two\n\n▮delete this\nwhole para\n\nkeep me', want: 'para one\nline two\n\nkeep me', sol: 'dap', tip: 'ap = a paragraph，连同后面的空行。' },
    ],
  },
  {
    id: 'yank', name: '复制粘贴', keys: ['yy', 'yw', 'p', 'P', 'ddp', 'xp'], need: ['delete'],
    intro: 'y 是复制（yank），p 粘贴到后面，P 粘贴到前面。删掉的东西也会进寄存器，所以 dd 再 p 就是移动。',
    puzzles: [
      { t: '复制这一行', buf: '▮print(1)', want: 'print(1)\nprint(1)', sol: 'yyp', tip: 'yy 复制整行，p 贴在下面。' },
      { t: '交换两行', buf: '▮second\nfirst', want: 'first\nsecond', sol: 'ddp', tip: 'ddp 是经典的换行连招。' },
      { t: '修正手误 teh', buf: 't▮eh', want: 'the', sol: 'xp', tip: 'xp 交换两个字符。' },
      { t: '一次贴三份', buf: '▮- [ ] todo', want: '- [ ] todo\n- [ ] todo\n- [ ] todo\n- [ ] todo', sol: 'yy3p', tip: 'p 前面也能加数字。' },
      { t: '把第一行挪到最后', buf: '▮c\na\nb', want: 'a\nb\nc', sol: 'ddjp', tip: '删掉、走到位置、贴上。' },
      { t: '把词复制到前面', buf: '▮hello world', want: 'hello hello world', sol: 'ywP', tip: 'yw 复制一个词（带空格），P 贴在光标前。' },
    ],
  },
  {
    id: 'dot', name: '点点点', keys: ['.', 'u', 'Ctrl-r'], need: ['change'],
    intro: '. 重复上一次修改，是 Vim 最省力的键。u 撤销，Ctrl-r 重做。',
    puzzles: [
      { t: '每行都补分号', buf: '▮let a = 1\nlet b = 2\nlet c = 3', want: 'let a = 1;\nlet b = 2;\nlet c = 3;', sol: 'A;<Esc>j.j.', tip: '改一次，之后 j. j. 就好。' },
      { t: '把每个 foo 换成 qux', buf: '▮foo bar foo baz foo', want: 'qux bar qux baz qux', sol: 'cwqux<Esc>ww.ww.', tip: '. 会重复整个 cw + 输入的内容。' },
      { t: '删两行垃圾', buf: '▮junk\njunk\nkeep', want: 'keep', sol: 'dd.', tip: '2dd 也行，这里练练 .。' },
      { t: '缩进两层', buf: '▮a()\nb()\nc()', want: '        a()\n        b()\n        c()', sol: '3>>.', tip: '3>> 缩进三行一层（本游戏 shiftwidth=4），. 再来一层。' },
      { t: '给前两项加逗号', buf: '▮"a"\n"b"\n"c"', want: '"a",\n"b",\n"c"', sol: 'A,<Esc>j.', tip: '最后一项不要逗号哦。' },
    ],
  },
  {
    id: 'search', name: '搜索飞行', keys: ['/', 'n', 'N', '*', '#', '%'], need: ['find'],
    intro: '/ 输入文字后回车，向下搜索；? 向上。n 下一个，N 上一个。* 搜索光标下的词。% 在配对的括号之间跳。',
    puzzles: [
      { t: '找到 TODO', buf: '▮import os\nimport sys\n\ndef load(path):\n    with open(path) as f:\n        data = f.read()\n    # ◎TODO: validate\n    return data\n\ndef main():\n    print(load("a.txt"))', sol: '/TODO<CR>', tip: '/ 输入要找的字，回车。' },
      { t: '第三个 err', buf: '▮if err != nil {\n    return err\n}\nlog(◎err)', sol: '/err<CR>nn', tip: 'n 跳到下一个结果。' },
      { t: '找到 count 下一次出现', buf: 'let ▮count = 0\nfor x in xs:\n    total += x\n    if x > 0:\n        ◎count += 1', sol: '*', tip: '* 搜索光标下的整个词。' },
      { t: '跳到配对的右括号', buf: '▮if (a && (b || c)◎) {', sol: '%', tip: '% 会先找到这一行的第一个括号，再跳到它的另一半。' },
      { t: '往回找 total', buf: '◎total = 0\nfor x in xs:\n    ▮total += x', sol: '#', tip: '# 是反方向的 *。' },
    ],
  },
  {
    id: 'visual', name: '可视模式', keys: ['v', 'V', 'U', 'p', '>'], need: ['textobj', 'yank'],
    intro: 'v 开始选择字符，V 选择整行。选好之后按 d y c > U 等操作。在选区里也能用 iw i( 这些对象。',
    puzzles: [
      { t: '后半句变大写', buf: 'make ▮this loud', want: 'make THIS LOUD', sol: 'v$U', tip: 'v 选中，$ 扩到行尾，U 变大写。' },
      { t: '把长名字贴到 x 的位置', buf: '▮very_long_identifier = 0\nvalue = x', want: 'very_long_identifier = 0\nvalue = very_long_identifier', sol: 'yiwj$vp', tip: '在可视模式下按 p，会用复制的内容替换选区。' },
      { t: '删掉整个 if 块', buf: '▮if debug {\n  log("x")\n  log("y")\n}\nrun()', want: 'run()', sol: 'V%d', tip: 'V 选行，% 跳到配对的 }，d 删掉。' },
      { t: '括号里的参数全大写', buf: 'call(▮abc, def)', want: 'call(ABC, DEF)', sol: 'vi(U', tip: 'vi( 选中括号里面。' },
      { t: '函数体整体缩进', buf: 'def f():\n▮a = 1\nb = 2\nreturn a + b', want: 'def f():\n    a = 1\n    b = 2\n    return a + b', sol: 'VG>', tip: 'V 选行、G 到底、> 缩进。不进可视模式直接 >G 也行。' },
    ],
  },
  {
    id: 'ex', name: '命令行', keys: [':s', ':%s', ':g', '&'], need: ['dot', 'search'],
    intro: ': 打开命令行。:%s/旧/新/g 全文替换，:g/模式/d 删除所有匹配的行。替换文本里的 & 代表匹配到的内容。',
    puzzles: [
      { t: '全文改名', buf: '▮oldName = load()\nprint(oldName)\nsave(oldName, oldName)\nlog("oldName")', want: 'newName = load()\nprint(newName)\nsave(newName, newName)\nlog("newName")', sol: ':%s/old/new/g<CR>', tip: '% 表示全文，g 表示一行里的每一个。' },
      { t: '删除所有调试输出', buf: '▮a = 1\nconsole.log(a)\nb = 2\nconsole.log(b)\nc = a + b\nconsole.log(c)\nreturn c', want: 'a = 1\nb = 2\nc = a + b\nreturn c', sol: ':g/log/d<CR>', tip: ':g/log/d 删除每一行包含 log 的行。' },
      { t: '给每行加引号和逗号', buf: '▮apple\nbanana\ncherry', want: '"apple",\n"banana",\n"cherry",', sol: ':%s/.*/"&",<CR>', tip: '.* 匹配整行，& 把它原样放回去。' },
      { t: '只改当前这一行', buf: 'x = x + 1\n▮y = x + x\nz = x', want: 'x = x + 1\ny = n + n\nz = x', sol: ':s/x/n/g<CR>', tip: '不加 % 只改当前行。' },
    ],
  },
  {
    id: 'boss', name: '最终关', keys: ['组合技'], need: ['visual', 'ex'],
    intro: '真实世界的小改动。没有新按键，只有你学过的所有东西。参考解只是一种答案，找到更短的会有额外奖励。',
    puzzles: [
      { t: '交换两个参数', buf: '▮result = divide(b, a)', want: 'result = divide(a, b)', sol: 'fbrafarb', tip: 'f 找到 b 用 r 换掉，再 f 找到 a 换掉。' },
      { t: 'console.log 改成 return', buf: '▮function greet(name) {\n  console.log("Hello, " + name)\n}', want: 'function greet(name) {\n  return "Hello, " + name;\n}', sol: 'jwcf(return <Esc>$r;', tip: 'cf( 改到左括号为止，$r; 把右括号换成分号。' },
      { t: '升级配置', buf: '{\n  ▮"name": "vim",\n  "year": 1991,\n}', want: '{\n  "name": "neovim",\n  "year": 2015\n}', sol: 'fvineo<Esc>jbC2015<Esc>', tip: '在 vim 前插入 neo，下一行用 C 重写年份并去掉逗号。' },
      { t: '修好函数缩进', buf: '▮def total(items):\ns = 0\nfor x in items:\n    s += x\nreturn s', want: 'def total(items):\n    s = 0\n    for x in items:\n        s += x\n    return s', sol: 'j>G', tip: '>G 从当前行缩进到文件末尾。' },
      { t: '整理导入', buf: '▮import sys\nimport os\nimport re', want: 'import os\nimport re\nimport sys', sol: 'ddGp', tip: '把 sys 挪到最后就排好序了。' },
    ],
  },
];

export const CH = Object.fromEntries(CHAPTERS.map((c) => [c.id, c]));

// Parse a puzzle's markers into text, cursor and target.
export function prep(p) {
  const rows = p.buf.split('\n');
  let cur = { r: 0, c: 0 }, tgt = null;
  const lines = rows.map((row, r) => {
    let out = '';
    for (const ch of row) {
      if (ch === '▮') cur = { r, c: out.length };
      else if (ch === '◎') tgt = { r, c: out.length };
      else out += ch;
    }
    return out;
  });
  const keys = parseKeys(p.sol);
  return { text: lines.join('\n'), cur, tgt, want: p.want ?? null, par: keys.length, keys };
}

export function allPuzzles() {
  const out = [];
  for (const ch of CHAPTERS) ch.puzzles.forEach((p, i) => out.push({ ...p, id: `${ch.id}.${i + 1}`, ch: ch.id, idx: i }));
  return out;
}

// Is a puzzle solved by this editor state?
export function solved(vim, info) {
  if (vim.mode !== 'normal' || vim.pend.length) return false;
  if (info.want != null) return vim.text === info.want;
  return vim.r === info.tgt.r && vim.c === info.tgt.c;
}
