'use strict';
const readline = require('node:readline');

function createIo() {
  return {
    info: (msg) => console.log(msg),
    error: (msg) => console.error(msg),
    prompt: (question) => new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
    }),
  };
}

module.exports = { createIo };
