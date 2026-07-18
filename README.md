# ts-wasm-libvirt

## Установка и зависимости

Нужны Node.js 20+ и системная библиотека libvirt. Для работы с локальным QEMU необходим запущенный демон libvirt и доступ пользователя к его сокету.

Debian/Ubuntu:

```sh
sudo apt install libvirt0 libvirt-daemon-system
npm install ts-wasm-libvirt
```

Полный интерактивный каталог возможностей и примеров: [README публичного пакета](packages/libvirt-adapter/README.md).

