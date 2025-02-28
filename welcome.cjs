const { execSync } = require('child_process');
const chalk = require('chalk');
const getGitHash = () => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'no-git-info';
  }
};

let commitJson = {
  hash: JSON.stringify(getGitHash()),
  version: JSON.stringify(process.env.npm_package_version),
};

console.log(chalk.blue(`
★═══════════════════════════════════════★
`) + chalk.green(`
       Welcome to the AutoTestX
          Commit Hash: ${JSON.parse(commitJson.hash)}
            Version: ${JSON.parse(commitJson.version)}
`) + chalk.blue(`
★═══════════════════════════════════════★
\n\n`));

