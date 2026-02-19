// src/components/layout/Footer.jsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../ui/Modal.jsx";

export default function Footer() {
  const nav = useNavigate();
  const [openKey, setOpenKey] = useState(null); // "terms" | "privacy" | null

  // ✅ Cole aqui seus textos (pode ser string grande)
  const TERMS_TEXT = useMemo(
    () => `
Termos de Uso — CineSuper

Última atualização: 28/01/2026
Site: www.cinesuper.com.br

Contato: contato@cinesuper.com.br

Estes Termos de Uso (“Termos”) regulam o acesso e a utilização do CineSuper (“CineSuper”, “Serviço”, “Plataforma”) por você (“Usuário”). Ao criar uma conta, assinar ou utilizar o CineSuper, você declara que leu, entendeu e concorda com estes Termos.

1. Definições

Para fins destes Termos:

CineSuper / Serviço / Plataforma: serviço de assinatura que permite assistir a conteúdos de entretenimento pela Internet por meio do site e/ou aplicativos do CineSuper.

Conteúdo: filmes, séries, episódios, trailers, artes, imagens, metadados, legendas, faixas de áudio, thumbnails e materiais relacionados disponibilizados na Plataforma.

Conta: cadastro individual do Usuário, com credenciais de autenticação e informações de assinatura.

Assinatura / Plano: contratação de acesso ao Serviço conforme o plano escolhido (recorrente no cartão ou por período no Pix).

Dispositivos compatíveis: aparelhos e softwares (navegadores, apps) capazes de reproduzir o Serviço, conforme suporte técnico vigente.

2. Elegibilidade e uso da Conta
2.1. Idade e responsabilidade

A assinatura deve ser realizada por pessoa com capacidade civil para contratar. Menores podem utilizar o CineSuper sob responsabilidade e supervisão de um responsável legal.

2.2. Segurança e credenciais

Você é responsável por manter a confidencialidade das credenciais de acesso e por todas as atividades realizadas na sua Conta. Em caso de suspeita de uso não autorizado, você deve informar o CineSuper pelo e-mail de contato.

2.3. Informações corretas

Você concorda em fornecer e manter informações corretas e atualizadas (especialmente e-mail) para comunicações relacionadas à Conta, pagamentos e segurança.

3. Planos e limites do Serviço

O CineSuper oferece os seguintes planos, com limites e recursos conforme abaixo:

3.1. CineSuper Prata — R$ 18,90/mês

2 telas simultâneas

Até Full HD (1080p)

2 perfis

Áudio estéreo (2.0)

3.2. CineSuper Ouro — R$ 22,90/mês (Recomendado)

4 telas simultâneas

Até Full HD (1080p)

4 perfis

Áudio estéreo + 5.1 (quando disponível)

Acesso antecipado a lançamentos do CineSuper (quando disponível)

3.3. CineSuper Diamante — R$ 26,90/mês

6 telas simultâneas

Até 4K (quando disponível)

6 perfis

Áudio 5.1 (quando disponível)

Prioridade no suporte

3.4. Uso fora da residência

O Usuário pode acessar o CineSuper em diferentes locais (incluindo fora da residência), desde que respeite os limites de telas simultâneas do plano contratado.

4. Assinatura, cobrança e pagamentos (Stripe e Mercado Pago)
4.1. Renovação automática

No cartão de crédito (Stripe), a assinatura é recorrente e permanecerá ativa até que seja cancelada. Ao assinar, você autoriza a cobrança automática do valor do plano em cada ciclo de faturamento. No Pix (Mercado Pago), cada pagamento libera acesso por 30 dias (ou 365 dias no plano anual) e não é recorrente.

4.2. Processamento por terceiros (Stripe e Mercado Pago)

Os pagamentos com cartão são processados pela Stripe e os pagamentos via Pix são processados pelo Mercado Pago. Esses provedores poderão aplicar regras próprias, incluindo autenticação, antifraude, limites, confirmação de pagamento e eventuais tarifas do meio de pagamento escolhido. O CineSuper não tem controle sobre aprovações/recusas do provedor de pagamento.

4.3. Falha de pagamento e suspensão

Se o pagamento não for concluído (por expiração, falta de saldo, recusa, chargeback, suspeita de fraude ou qualquer outro motivo), o CineSuper poderá suspender o acesso ao Serviço até a regularização.

4.4. Impostos

Quando aplicável, tributos podem incidir sobre a cobrança, conforme legislação e regras do provedor de pagamento.

5. Cancelamento e reembolsos
5.1. Cancelamento

Você pode cancelar a assinatura a qualquer momento. Após o cancelamento, o acesso poderá permanecer disponível até o fim do período já pago, salvo situações de fraude, abuso ou uso indevido.

5.2. Reembolsos

Salvo quando exigido por lei, os pagamentos não são reembolsáveis e não há créditos por período parcialmente utilizado.

6. Catálogo, disponibilidade e alterações do Serviço
6.1. Catálogo dinâmico

O catálogo pode ser atualizado, removido ou alterado a qualquer momento por motivos técnicos, editoriais, contratuais, legais ou de licenciamento. O CineSuper não garante que um título específico permaneça disponível por determinado período.

6.2. Evolução do Serviço

O CineSuper pode modificar recursos, interfaces e funcionalidades para manutenção, correções, melhorias e segurança.

7. Qualidade de reprodução e requisitos técnicos
7.1. Variação de qualidade

A qualidade de vídeo e áudio pode variar conforme dispositivo, navegador/aplicativo, desempenho do aparelho, velocidade e estabilidade da internet, rotas de rede e congestionamento.

7.2. Consumo de dados

Você é responsável por qualquer custo de internet/dados móveis cobrado pelo seu provedor.

8. Conteúdo, classificação indicativa e perfis
8.1. Classificação indicativa

O CineSuper disponibiliza conteúdos com diferentes classificações indicativas, podendo incluir títulos com classificação 18 (sem natureza pornográfica). Cabe ao Usuário e/ou responsável legal selecionar conteúdos adequados e supervisionar menores.

8.2. Perfis

Os perfis são destinados à organização interna do uso da Conta. O Usuário continua responsável por toda atividade dentro da Conta.

9. Propriedade intelectual e licença de uso
9.1. Licença limitada

Durante a vigência da assinatura, o CineSuper concede uma licença limitada, não exclusiva, intransferível e revogável para acessar e reproduzir o Conteúdo dentro da Plataforma, conforme estes Termos.

9.2. Restrições

É proibido, sem autorização expressa do CineSuper:

Copiar, gravar, reproduzir, distribuir, retransmitir, vender, alugar, sublicenciar ou explorar comercialmente o Conteúdo;

Remover avisos de direitos autorais/marcas;

Burlar autenticação, controles de acesso, limites de plano ou medidas de proteção do Serviço.

10. Condutas proibidas e segurança

Você concorda em não:

Usar robôs, crawlers, scrapers ou automações para acessar ou extrair dados do Serviço;

Tentar engenharia reversa, descompilar ou explorar vulnerabilidades da Plataforma;

Introduzir malware, scripts maliciosos ou atividades que prejudiquem a disponibilidade;

Praticar fraude (incluindo chargeback indevido, uso de pagamento de terceiros sem autorização, ou tentativas de contornar limites do plano).

O CineSuper poderá suspender, restringir ou encerrar Contas em caso de violação destes Termos, fraude, abuso, risco de segurança ou obrigação legal.

11. Suporte e comunicações
11.1. Atendimento

O suporte é prestado via contato@cinesuper.com.br
. O prazo de resposta pode variar conforme a demanda e conforme o plano (quando houver “prioridade no suporte”).

11.2. Comunicações eletrônicas

Você concorda em receber comunicações relacionadas à sua Conta e assinatura em formato eletrônico (e-mail e/ou notificações na Plataforma).

12. Isenção e limitação de responsabilidade

O Serviço é fornecido “como está” e pode apresentar interrupções, falhas, instabilidades, manutenções e indisponibilidades. Na extensão permitida por lei, o CineSuper não se responsabiliza por:

Falhas decorrentes de conexão do Usuário, provedor de internet, dispositivo, configurações locais ou incompatibilidades;

Danos indiretos, lucros cessantes e prejuízos consequenciais relacionados ao uso do Serviço.

Nada nestes Termos exclui ou limita direitos do consumidor que sejam irrenunciáveis nos termos da legislação aplicável.

13. Alterações destes Termos

O CineSuper poderá atualizar estes Termos periodicamente. Quando houver alteração relevante, o Usuário será notificado por meios eletrônicos e/ou na Plataforma. O uso continuado após a vigência das alterações poderá ser considerado concordância, quando permitido por lei.

14. Disposições gerais
14.1. Validade parcial

Se qualquer disposição for considerada inválida, as demais permanecem em pleno vigor.

14.2. Caso fortuito e força maior

O CineSuper não será responsável por indisponibilidades decorrentes de eventos fora do controle razoável (falhas de energia, ataques, instabilidade de rede, provedores, ordens governamentais, etc.).

14.3. Lei aplicável e foro

Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio do consumidor, conforme legislação aplicável.
`,
    []
  );

  const PRIVACY_TEXT = useMemo(
    () => `
Política de Privacidade — CineSuper

Última atualização: 28/01/2026
Site: www.cinesuper.com.br

Contato: contato@cinesuper.com.br

Esta Política de Privacidade (“Política”) explica como o CineSuper (“CineSuper”, “nós”) coleta, usa, compartilha e protege dados pessoais quando você (“Usuário”, “Titular”) acessa o site e utiliza o serviço de assinatura e streaming do CineSuper (“Serviço”).

Ao usar o Serviço, você declara que leu e compreendeu esta Política.

1. Quais dados coletamos

O CineSuper poderá coletar dados pessoais conforme abaixo, dependendo de como você usa o Serviço.

1.1. Dados fornecidos por você

Cadastro e conta: nome (quando informado), e-mail, senha (armazenada de forma protegida/irreversível), preferências de perfil.

Contato e suporte: mensagens enviadas ao suporte, histórico de solicitações e informações que você optar por compartilhar.

1.2. Dados coletados automaticamente

Dados de acesso e uso: data e hora de acesso, páginas/recursos acessados, interações no player (ex.: play/pausa/tempo assistido), erros técnicos.

Dados do dispositivo e conexão: endereço IP, identificadores técnicos, tipo de dispositivo, sistema operacional, navegador, resolução de tela, idioma, informações de rede e logs de desempenho.

Cookies e tecnologias similares: conforme a seção “Cookies” desta Política.

1.3. Dados de pagamento (Stripe e Mercado Pago)

Os pagamentos com cartão são processados pela Stripe e os pagamentos via Pix são processados pelo Mercado Pago. Em regra, o CineSuper não armazena dados completos de cartão. Podemos receber dos provedores informações como:

Status do pagamento (aprovado/recusado/estornado/chargeback),

Identificadores de transação,

Plano adquirido, valor e data de cobrança,

Dados antifraude e validações fornecidas pelo provedor, quando aplicável.

2. Para que usamos os dados (finalidades)

Usamos dados pessoais para:

Criar e administrar sua conta e seus perfis;

Fornecer o Serviço de streaming, incluindo autenticação, controle de telas simultâneas e performance de reprodução;

Gerenciar assinatura e acesso, incluindo verificação de pagamento, renovação e cancelamento;

Atendimento ao usuário, suporte, respostas a solicitações e comunicação operacional;

Segurança e prevenção a fraudes, incluindo detecção de acessos suspeitos, abuso e chargebacks;

Melhoria do Serviço, correção de bugs, métricas técnicas e evolução de funcionalidades;

Cumprimento de obrigações legais e regulatórias, quando necessário.

O CineSuper não exibe anúncios e não vende dados pessoais.

3. Bases legais (LGPD)

Tratamos dados pessoais com base nas hipóteses legais da LGPD, conforme aplicável:

Execução de contrato (art. 7º, V): para fornecer o Serviço, criar conta e gerenciar assinatura;

Cumprimento de obrigação legal/regulatória (art. 7º, II): obrigações fiscais, contábeis, atendimento a autoridades;

Legítimo interesse (art. 7º, IX): segurança, prevenção a fraudes, melhoria do Serviço, métricas técnicas e suporte, sempre com avaliação de impacto e respeito aos seus direitos;

Consentimento (art. 7º, I): quando necessário, especialmente para certas categorias de cookies e preferências.

4. Com quem compartilhamos dados

Podemos compartilhar dados pessoais somente quando necessário para operar o Serviço:

4.1. Prestadores de serviço (operadores)

Stripe (processamento de cartão e antifraude);
Mercado Pago (processamento de Pix e antifraude);

Provedores de infraestrutura e armazenamento (ex.: servidores, banco de dados, CDN/armazenamento de mídia), para viabilizar autenticação, entrega de conteúdo e estabilidade;

Ferramentas de monitoramento e segurança (quando utilizadas), para detecção de falhas e abusos.

Esses parceiros tratam dados conforme instruções do CineSuper e suas próprias políticas, quando atuarem como controladores independentes (por exemplo, no caso do provedor de pagamento).

4.2. Obrigação legal

Podemos compartilhar dados mediante ordem judicial, requisição de autoridade competente ou para cumprir obrigações legais.

4.3. Proteção de direitos

Podemos compartilhar dados para proteger direitos do CineSuper, Usuários e terceiros, inclusive em casos de fraude, chargeback, incidentes de segurança e violações dos Termos de Uso.

5. Transferência internacional

Dependendo da infraestrutura técnica utilizada, dados podem ser processados e armazenados em servidores localizados fora do Brasil. Nesses casos, o CineSuper adotará medidas para garantir proteção adequada, conforme exigências da LGPD, incluindo cláusulas contratuais e padrões de segurança.

6. Cookies e tecnologias similares

Cookies são pequenos arquivos armazenados no seu dispositivo para permitir funcionalidades e melhorar a experiência.

6.1. Tipos de cookies que podemos usar

Estritamente necessários: autenticação, sessão, segurança e funcionamento do site/player.

Funcionais: preferências e configurações (ex.: idioma, layout, perfis).

Desempenho/diagnóstico (quando aplicável): métricas técnicas e erros para melhorar a estabilidade.

6.2. Como gerenciar cookies

Você pode gerenciar cookies nas configurações do seu navegador. Bloquear cookies estritamente necessários pode impedir o funcionamento do login e do Serviço.

Se o CineSuper implementar um banner de consentimento, você poderá ajustar preferências de cookies não essenciais diretamente nele.

7. Retenção e descarte de dados

Mantemos dados pessoais pelo tempo necessário para cumprir as finalidades desta Política, incluindo:

Conta e assinatura: enquanto sua conta estiver ativa e durante prazo razoável após cancelamento para auditoria, prevenção a fraudes e obrigações legais;

Registros e transações: conforme prazos legais, fiscais e contábeis aplicáveis;

Logs de segurança: pelo tempo necessário para prevenir abuso, investigar incidentes e resguardar direitos.

Após o término dos prazos aplicáveis, os dados são excluídos ou anonimizados, quando tecnicamente viável.

8. Segurança da informação

Adotamos medidas técnicas e organizacionais razoáveis para proteger dados pessoais, incluindo (quando aplicável):

Criptografia em trânsito (HTTPS/TLS);

Controles de acesso e autenticação;

Registro de eventos e monitoramento;

Práticas de minimização e segregação de dados.

Ainda assim, nenhum sistema é 100% seguro. Em caso de incidente relevante, o CineSuper adotará medidas de resposta e notificações conforme exigido pela LGPD.

9. Direitos do titular (LGPD)

Você pode solicitar, conforme aplicável:

Confirmação de tratamento e acesso aos dados;

Correção de dados incompletos/inexatos;

Portabilidade (quando aplicável);

Anonimização, bloqueio ou eliminação de dados desnecessários/excessivos;

Informações sobre compartilhamentos;

Revogação de consentimento (quando o tratamento depender de consentimento);

Revisão de decisões automatizadas, quando houver.

Para exercer seus direitos, entre em contato: contato@cinesuper.com.br
.
Poderemos solicitar validação de identidade para evitar fraudes e proteger sua conta.

10. Crianças e adolescentes

O CineSuper pode disponibilizar conteúdo com diferentes classificações indicativas, inclusive 18. O Serviço não é direcionado a crianças. O uso por menores deve ocorrer sob supervisão de responsável legal, que é o responsável por orientar o acesso e as escolhas de conteúdo.

11. Conteúdos e links de terceiros

O CineSuper pode exibir links externos (ex.: páginas de suporte ou provedores). Não controlamos práticas de privacidade de sites de terceiros. Recomendamos ler as políticas desses serviços.

12. Alterações desta Política

Podemos atualizar esta Política para refletir mudanças no Serviço, exigências legais ou melhorias. A data de “Última atualização” será ajustada. Em mudanças relevantes, poderemos notificar via e-mail e/ou dentro da Plataforma.

13. Canal de contato

Para dúvidas, solicitações e direitos LGPD:
contato@cinesuper.com.br
`,
    []
  );

  const modalTitle =
    openKey === "terms"
      ? "Termos de Uso"
      : openKey === "privacy"
        ? "Política de Privacidade"
        : "";

  const modalText =
    openKey === "terms" ? TERMS_TEXT : openKey === "privacy" ? PRIVACY_TEXT : "";

  return (
    <>
      <footer className="border-t border-white/10 bg-black">
        <div className="w-full px-4 sm:px-6 lg:px-10 2xl:px-14 py-10 text-sm text-white/60">
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <button
              type="button"
              onClick={() => nav("/contato")}
              className="text-left hover:text-white transition"
            >
              Central de Ajuda
            </button>

            <button
              type="button"
              onClick={() => setOpenKey("terms")}
              className="text-left hover:text-white transition"
            >
              Termos de Uso
            </button>

            <button
              type="button"
              onClick={() => setOpenKey("privacy")}
              className="text-left hover:text-white transition"
            >
              Privacidade
            </button>

            <button
              type="button"
              onClick={() => nav("/contato")}
              className="text-left hover:text-white transition"
            >
              Contato
            </button>
          </div>

          <div className="mt-8 text-xs text-white/40">
            © {new Date().getFullYear()} Cine Super. Todos os direitos reservados.
          </div>
        </div>
      </footer>

      <Modal open={!!openKey} title={modalTitle} onClose={() => setOpenKey(null)}>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-white/80 m-0">
          {modalText}
        </pre>
      </Modal>
    </>
  );
}
