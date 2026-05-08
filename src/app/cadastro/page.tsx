async function cadastrar() {
  setErro('')
  if (!nome.trim()) { setErro('Preencha seu nome completo.'); return }
  if (cpf.replace(/\D/g, '').length < 11) { setErro('CPF inválido.'); return }
  if (telefone.replace(/\D/g, '').length < 10) { setErro('Telefone inválido.'); return }
  if (!email.trim()) { setErro('Preencha o email.'); return }
  if (senha.length < 6) { setErro('A senha deve ter pelo menos 6 caracteres.'); return }
  if (senha !== senha2) { setErro('As senhas não coincidem.'); return }

  setSalvando(true)

  // Verifica se CPF já existe
  const cpfLimpo = cpf.replace(/\D/g, '')
  const { data: cpfExiste } = await supabase
    .from('clientes')
    .select('id')
    .eq('cpf', cpfLimpo)
    .maybeSingle()

  if (cpfExiste) {
    setErro('Este CPF já está cadastrado. Faça login ou recupere sua senha.')
    setSalvando(false)
    return
  }

  // Verifica se email já existe
  const { data: emailExiste } = await supabase
    .from('clientes')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle()

  if (emailExiste) {
    setErro('Este email já está cadastrado. Faça login ou recupere sua senha.')
    setSalvando(false)
    return
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password: senha,
    options: { data: { nome } }
  })

  if (authError || !authData.user) {
    setErro(authError?.message === 'User already registered'
      ? 'Este email já está cadastrado.'
      : 'Erro ao criar conta. Tente novamente.')
    setSalvando(false)
    return
  }

  const userId = authData.user.id

  await supabase.from('perfis').upsert({
    id: userId,
    nome: nome.trim(),
    role: 'cliente',
    ativo: true,
  })

  const { error: clienteError } = await supabase.from('clientes').insert({
    user_id: userId,
    nome: nome.trim(),
    cpf: cpfLimpo,
    telefone: telefone.replace(/\D/g, ''),
    whatsapp: telefone.replace(/\D/g, ''),
    email: email.trim(),
    notificacao_preferida: notificacao,
    planos: ['wellhub'],
    bloqueado: false,
  })

  if (clienteError) {
    setErro('Erro ao finalizar cadastro. Entre em contato com a recepção.')
    setSalvando(false)
    return
  }

  setSalvando(false)
  setSucesso(true)
  await supabase.auth.signOut()
  setTimeout(() => router.push('/login'), 2500)
}
