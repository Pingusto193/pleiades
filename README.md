# Focus Trip

Trabalho da competicao com cadastro de usuarios, historico de estudos, agenda e perfil.

## Como Rodar

```bash
npm install
npm start
```

Depois abra:

```text
http://localhost:3000
```

## Banco E Uploads

- O banco SQLite fica em `data/focus-trip.db`.
- As fotos de perfil enviadas ficam em `uploads/`.
- Essas pastas nao entram no Git porque guardam dados reais de usuarios.

## O Que A API Salva

- Dados da conta: nome, e-mail, senha protegida por hash, rotina, streak, XP, nivel e conquistas.
- Sessoes de estudo concluidas ou encerradas.
- Materias cadastradas na agenda.
- Foto de perfil do usuario.
