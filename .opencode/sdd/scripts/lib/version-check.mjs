import fs from "node:fs";
import path from "node:path";

export function checkVersions(root, expected) {
  const errors = [];
  const pkgPath = path.join(root, "package.json");
  const readmePath = path.join(root, "README.md");
  const changelogPath = path.join(root, "CHANGELOG.md");
  if (!fs.existsSync(pkgPath)) {
    errors.push("缺少 package.json");
  } else {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.version !== expected) errors.push(`package.json ${pkg.version} != version.mjs ${expected}`);
    } catch (error) {
      errors.push(`package.json 解析失败：${error.message}`);
    }
  }
  if (!fs.existsSync(readmePath)) {
    errors.push("缺少 README.md");
  } else {
    const readme = fs.readFileSync(readmePath, "utf8");
    const version = readme.match(/当前版本：`([0-9]+\.[0-9]+\.[0-9]+)`/)?.[1];
    if (version !== expected) errors.push(`README.md ${version ?? "未找到版本"} != version.mjs ${expected}`);
  }
  if (!fs.existsSync(changelogPath)) {
    errors.push("缺少 CHANGELOG.md");
  } else {
    const changelog = fs.readFileSync(changelogPath, "utf8");
    const version = changelog.match(/^##\s+([0-9]+\.[0-9]+\.[0-9]+)/m)?.[1];
    if (version !== expected) errors.push(`CHANGELOG.md ${version ?? "未找到版本"} != version.mjs ${expected}`);
  }
  return errors;
}
