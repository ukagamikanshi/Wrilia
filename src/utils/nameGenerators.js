/**
 * 名前自動生成ユーティリティ（完全ローカル処理）
 */
import { NAME_DATA } from '../data/nameData';
import { PLACE_NAME_DATA } from '../data/placeNameData';

function pickRandom(arr) {
    if (!arr || arr.length === 0) return '';
    return arr[Math.floor(Math.random() * arr.length)];
}

// 人物名生成
export function generateCharacterName(genre, gender = 'any', hasMiddleName = false) {
    const data = NAME_DATA[genre];
    if (!data) return '名前データなし';

    let genderKey = gender;
    if (gender === 'any') {
        genderKey = Math.random() > 0.5 ? 'male' : 'female';
    }

    const names = data[genderKey] || data['male'];
    if (!names) return '名前データなし';

    const firstName = pickRandom(names.first);
    const lastName = pickRandom(names.last || []);
    let middleName = '';

    if (hasMiddleName && names.middle && names.middle.length > 0) {
        middleName = pickRandom(names.middle);
    }

    if (data.format === 'eastern') {
        // 東洋式: 姓 + 名
        return lastName ? `${lastName} ${firstName}` : firstName;
    } else {
        // 西洋式: 名 + ミドルネーム + 姓
        const parts = [firstName];
        if (middleName) parts.push(middleName);
        if (lastName) parts.push(lastName);
        return parts.join(' ');
    }
}

// 場所名生成
export function generatePlaceName(genre) {
    const data = PLACE_NAME_DATA[genre];
    if (!data) return '地名データなし';

    const prefix = pickRandom(data.prefix || []);
    const root = pickRandom(data.root || []);
    const suffix = pickRandom(data.suffix || []);

    if (data.format === 'compound') {
        return `${prefix}${root}${suffix}`;
    } else if (data.format === 'prefix-suffix') {
        return `${prefix}${suffix}`;
    } else {
        return `${root}${suffix}`;
    }
}
