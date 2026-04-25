# 🏋️ COACH CT — Guia de Instalação Completo

Sistema de gestão de coaches, treinos e relatórios financeiros para academias.

---

## Pré-requisitos

Antes de começar, você precisa criar contas gratuitas em:
- **GitHub**: github.com
- **Supabase**: supabase.com  
- **Vercel**: vercel.com

---

## PASSO 1 — Configurar o banco de dados (Supabase)

1. Acesse **supabase.com** e crie uma conta
2. Clique em **"New Project"**
3. Escolha um nome (ex: `coachct`) e uma senha forte
4. Aguarde a criação (≈ 2 minutos)
5. No menu esquerdo, clique em **"SQL Editor"**
6. Copie todo o conteúdo do arquivo `supabase/schema.sql` deste projeto
7. Cole no editor e clique em **"Run"**
8. Você verá todas as tabelas criadas com sucesso

### Pegar as chaves do Supabase:
1. Vá em **Settings → API**
2. Copie o **Project URL** e o **anon public key**
3. Guarde esses dois valores para o Passo 3

### Criar o primeiro usuário Admin:
1. No Supabase, vá em **Authentication → Users**
2. Clique em **"Invite user"** (ou "Add user")
3. Coloque seu email e senha
4. Depois vá em **Table Editor → perfis**
5. Encontre seu usuário e altere o campo `role` para `admin`

### Criar usuário da Ju Hitomi:
1. Em **Authentication → Users**, clique em **"Add user"**
2. Email da Ju + senha temporária
3. Em **Table Editor → perfis**, altere o `role` para `coordenadora`

### Criar usuários dos coaches:
1. Para cada coach, **"Add user"** em Authentication
2. Em **perfis**, deixe o `role` como `coach`
3. Em **Table Editor → coaches**, preencha os dados do coach e coloque o `user_id` do usuário criado

---

## PASSO 2 — Subir o código no GitHub

1. Acesse **github.com** e crie uma conta
2. Clique em **"New repository"**
3. Nome: `coachct` → clique em **"Create repository"**
4. Faça upload de todos os arquivos desta pasta para o repositório
   - Clique em **"uploading an existing file"**
   - Arraste todos os arquivos e pastas
   - Clique em **"Commit changes"**

---

## PASSO 3 — Publicar na internet (Vercel)

1. Acesse **vercel.com** e crie uma conta (pode entrar com o GitHub)
2. Clique em **"New Project"**
3. Selecione o repositório `coachct` que você criou
4. Antes de clicar em Deploy, clique em **"Environment Variables"**
5. Adicione as duas variáveis:

```
NEXT_PUBLIC_SUPABASE_URL = (cole o Project URL do Supabase)
NEXT_PUBLIC_SUPABASE_ANON_KEY = (cole o anon public key do Supabase)
```

6. Clique em **"Deploy"**
7. Aguarde ≈ 2 minutos

✅ Pronto! Você receberá um link tipo `coachct.vercel.app` — este é o endereço do seu sistema.

---

## Estrutura de usuários e acessos

| Perfil | O que acessa |
|--------|-------------|
| **Admin** | Dashboard, financeiro, coaches, todos os relatórios |
| **Coordenadora (Ju)** | Biblioteca de exercícios, montar treinos, publicar |
| **Coach** | Painel pessoal, alunos, registrar aula, histórico |

---

## Funcionalidades implementadas

### Admin
- Dashboard com faturamento, custo e margem bruta em tempo real
- Cadastro de coaches com **salário fixo + adicional por aula**
- Grade de horários por coach (dias × horas)
- Relatório custo × retorno com ponto de equilíbrio
- Pagamentos mensais com breakdown fixo/variável
- Frequência de alunos
- Mapa de calor de horários populares

### Coordenadora (Ju)
- Biblioteca de exercícios por categoria
- Número de máquina e observações por exercício
- Montar treinos selecionando exercícios da biblioteca
- Publicar/despublicar treinos por mês

### Coach
- Painel com aulas do dia/mês e indicador de equilíbrio
- Buscar, cadastrar e editar alunos (nome + CPF)
- Registrar aula com seleção de aluno e treino
- **Autosave automático** a cada alteração de carga
- Histórico de cargas por máquina e aluno (última carga sugerida)
- Observações da Ju visíveis durante o treino

---

## Atualizar o sistema no futuro

Sempre que quiser mudar alguma coisa:
1. Edite os arquivos no GitHub diretamente (clique no arquivo → ícone de lápis)
2. A Vercel detecta automaticamente e atualiza o site em ≈ 2 minutos

---

## Suporte e custos

- **Supabase gratuito**: até 500MB de dados e 50.000 requisições/mês (suficiente para começar)
- **Vercel gratuito**: ilimitado para projetos pessoais/pequenos
- **Custo mensal inicial: R$ 0**

Quando crescer (mais de 500 alunos ativos ou muito uso):
- Supabase Pro: ~US$25/mês
- Vercel Pro: ~US$20/mês
