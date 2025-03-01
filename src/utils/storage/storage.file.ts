import fs from 'fs';
import path from 'path';
import { cwd } from 'process';
export default class Storage {

    public addContainer = (lang: string, id: string) => {
        const container = { lang, id };
        let containers = [];
        const filePath = path.join(cwd(), '.cache/container.json');
        console.log(filePath);
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            containers = JSON.parse(fileContent);
        }
        containers.push(container);
        fs.writeFileSync(filePath, JSON.stringify(containers));
    }
    public getContainer = (lang: string) => {
        const filePath = path.join(cwd(), '.cache/container.json');
        console.log(filePath);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const containers = JSON.parse(fileContent);
        for (const container of containers) {
            if (container.lang === lang) {
                return container.id;
            }
        }
        return null;
    }
}