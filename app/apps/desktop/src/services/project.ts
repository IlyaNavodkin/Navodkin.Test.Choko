import { node } from '@/lib/node';
import { ConfigYamlSchema } from '@/schemas';
import { migrateChokoData } from './choko-migration';
import { CHOKO_GITIGNORE, serializeConfigYaml } from './format/config';
import { resolveRepoWritePath, writeFileAtomic } from './repo-fs';
import { CONFIG_REL, parseYamlDoc } from './repo-paths';

export interface CreateProjectArgs { name: string; parentPath: string }

export function projectFolderName(name: string): string {
  const folder = name.trim();
  if (!folder || folder === '.' || folder === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(folder) || /[. ]$/.test(folder) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(folder)) {
    throw new Error('Укажите название без символов / \\ : * ? и зарезервированных имён Windows.');
  }
  return folder;
}

async function ensureGitAvailable(directory: string): Promise<void> {
  try { await node.simpleGit()(directory).version(); }
  catch { throw new Error('Git недоступен. Используйте полную сборку Choko или установите Git для запуска из исходников.'); }
}

/** Create only a new child folder. Existing folders are opened/adopted through a separate explicit action. */
export async function createProject({ name, parentPath }: CreateProjectArgs): Promise<string> {
  const folder = projectFolderName(name);
  const path = node.path();
  if (!path.isAbsolute(parentPath)) throw new Error('Выберите папку, в которой создать проект.');
  const parent = await node.fsp().stat(parentPath);
  if (!parent.isDirectory()) throw new Error('Выберите существующую папку.');
  await ensureGitAvailable(parentPath);
  if (await node.simpleGit()(parentPath).checkIsRepo()) {
    throw new Error('Создайте проект вне существующего Git-проекта или откройте его корневую папку.');
  }
  const root = path.join(parentPath, folder);
  try { await node.fsp().mkdir(root); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Папка с таким названием уже существует. Откройте её как проект или выберите другое название.');
    throw error;
  }
  await initializeProject(root, folder);
  return root;
}

/** Add Choko to a folder, preserving existing documents and configured workspaces. */
export async function initializeProject(root: string, name?: string): Promise<void> {
  const path = node.path();
  const fsp = node.fsp();
  if (!path.isAbsolute(root) || !(await fsp.stat(root)).isDirectory()) throw new Error('Выберите папку проекта.');
  await ensureGitAvailable(root);
  const git = node.simpleGit()(root);
  const isRepo = await git.checkIsRepo();
  if (isRepo) {
    const actualRoot = await fsp.realpath((await git.revparse(['--show-toplevel'])).trim());
    if (path.relative(actualRoot, await fsp.realpath(root)) !== '') throw new Error('Выбрана папка внутри другого Git-проекта. Откройте его корневую папку.');
  }
  await migrateChokoData(root);
  const configPath = await resolveRepoWritePath(root, CONFIG_REL);
  let raw: string | null = null;
  try { raw = await fsp.readFile(configPath, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const config = ConfigYamlSchema.safeParse(raw === null ? {} : parseYamlDoc(raw));
  if (!config.success) throw new Error('Не удалось прочитать настройки существующего проекта. Файлы оставлены без изменений.');
  if (!isRepo) {
    await git.init(false, ['--initial-branch=main']);
    // A fresh standalone install can keep local history without global Git setup.
    if (!(await git.getConfig('user.name')).value) await git.addConfig('user.name', 'Choko', false, 'local');
    if (!(await git.getConfig('user.email')).value) await git.addConfig('user.email', 'local@choko.invalid', false, 'local');
  }
  if (!config.data.workspaces.length) {
    await writeFileAtomic(root, CONFIG_REL, serializeConfigYaml({
      version: config.data.version,
      name: config.data.name || name || path.basename(root),
      description: config.data.description,
      displayIdPrefix: config.data.displayIdPrefix || 'QA',
      workspaces: ['.'],
    }));
  }
  const runs = await resolveRepoWritePath(root, '.ch/runs/.gitkeep');
  await fsp.mkdir(path.dirname(runs), { recursive: true });
  await fsp.writeFile(runs, '', { flag: 'a' });
  const ignore = await resolveRepoWritePath(root, '.ch/.gitignore');
  try { await fsp.writeFile(ignore, CHOKO_GITIGNORE, { flag: 'wx' }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
}
