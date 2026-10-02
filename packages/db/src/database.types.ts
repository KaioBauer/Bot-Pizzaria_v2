export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      atendimentos: {
        Row: {
          canal: string
          chat_id: string
          cliente_nome: string | null
          created_at: string
          ia_pausada: boolean
          motivo: string | null
          pausada_em: string | null
          pausada_por: string | null
          precisa_atencao: boolean
          ultima_mensagem: string | null
          ultima_mensagem_autor: string | null
          ultima_mensagem_em: string
          updated_at: string
        }
        Insert: {
          canal: string
          chat_id: string
          cliente_nome?: string | null
          created_at?: string
          ia_pausada?: boolean
          motivo?: string | null
          pausada_em?: string | null
          pausada_por?: string | null
          precisa_atencao?: boolean
          ultima_mensagem?: string | null
          ultima_mensagem_autor?: string | null
          ultima_mensagem_em?: string
          updated_at?: string
        }
        Update: {
          canal?: string
          chat_id?: string
          cliente_nome?: string | null
          created_at?: string
          ia_pausada?: boolean
          motivo?: string | null
          pausada_em?: string | null
          pausada_por?: string | null
          precisa_atencao?: boolean
          ultima_mensagem?: string | null
          ultima_mensagem_autor?: string | null
          ultima_mensagem_em?: string
          updated_at?: string
        }
        Relationships: []
      }
      bairros_entrega: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          taxa: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          taxa: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          taxa?: number
        }
        Relationships: []
      }
      carrinhos_web: {
        Row: {
          codigo: string
          criado_em: string
          expira_em: string
          itens: Json
          usado_em: string | null
        }
        Insert: {
          codigo: string
          criado_em?: string
          expira_em?: string
          itens: Json
          usado_em?: string | null
        }
        Update: {
          codigo?: string
          criado_em?: string
          expira_em?: string
          itens?: Json
          usado_em?: string | null
        }
        Relationships: []
      }
      categorias: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      clientes: {
        Row: {
          canal: string
          chat_id: string
          created_at: string
          id: string
          nome: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          canal: string
          chat_id: string
          created_at?: string
          id?: string
          nome?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          canal?: string
          chat_id?: string
          created_at?: string
          id?: string
          nome?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          aceitando_pedidos: boolean
          endereco: string | null
          fuso_horario: string
          id: boolean
          instagram: string | null
          nome_pizzaria: string
          pedido_minimo: number
          pix_expiracao_minutos: number
          telefone: string | null
          telegram_usuario: string | null
          updated_at: string
          whatsapp_numero: string | null
        }
        Insert: {
          aceitando_pedidos?: boolean
          endereco?: string | null
          fuso_horario?: string
          id?: boolean
          instagram?: string | null
          nome_pizzaria?: string
          pedido_minimo?: number
          pix_expiracao_minutos?: number
          telefone?: string | null
          telegram_usuario?: string | null
          updated_at?: string
          whatsapp_numero?: string | null
        }
        Update: {
          aceitando_pedidos?: boolean
          endereco?: string | null
          fuso_horario?: string
          id?: boolean
          instagram?: string | null
          nome_pizzaria?: string
          pedido_minimo?: number
          pix_expiracao_minutos?: number
          telefone?: string | null
          telegram_usuario?: string | null
          updated_at?: string
          whatsapp_numero?: string | null
        }
        Relationships: []
      }
      conversa_mensagens: {
        Row: {
          autor: string | null
          autor_id: string | null
          conteudo: string | null
          conversa_id: string
          created_at: string
          id: number
          papel: string
          tool_call_id: string | null
          tool_calls: Json | null
        }
        Insert: {
          autor?: string | null
          autor_id?: string | null
          conteudo?: string | null
          conversa_id: string
          created_at?: string
          id?: never
          papel: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Update: {
          autor?: string | null
          autor_id?: string | null
          conteudo?: string | null
          conversa_id?: string
          created_at?: string
          id?: never
          papel?: string
          tool_call_id?: string | null
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversa_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas: {
        Row: {
          canal: string
          chat_id: string
          created_at: string
          encerrada_em: string | null
          id: string
          pedido_id: string | null
          updated_at: string
        }
        Insert: {
          canal: string
          chat_id: string
          created_at?: string
          encerrada_em?: string | null
          id?: string
          pedido_id?: string | null
          updated_at?: string
        }
        Update: {
          canal?: string
          chat_id?: string
          created_at?: string
          encerrada_em?: string | null
          id?: string
          pedido_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      enderecos: {
        Row: {
          bairro: string | null
          bairro_id: string | null
          cliente_id: string
          complemento: string | null
          created_at: string
          id: string
          numero: string | null
          padrao: boolean
          referencia: string | null
          rua: string
        }
        Insert: {
          bairro?: string | null
          bairro_id?: string | null
          cliente_id: string
          complemento?: string | null
          created_at?: string
          id?: string
          numero?: string | null
          padrao?: boolean
          referencia?: string | null
          rua: string
        }
        Update: {
          bairro?: string | null
          bairro_id?: string | null
          cliente_id?: string
          complemento?: string | null
          created_at?: string
          id?: string
          numero?: string | null
          padrao?: boolean
          referencia?: string | null
          rua?: string
        }
        Relationships: [
          {
            foreignKeyName: "enderecos_bairro_id_fkey"
            columns: ["bairro_id"]
            isOneToOne: false
            referencedRelation: "bairros_entrega"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enderecos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      entregadores: {
        Row: {
          ativo: boolean
          created_at: string
          nome: string
          telefone: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          nome: string
          telefone?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          nome?: string
          telefone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      horarios_funcionamento: {
        Row: {
          abre: string
          dia_semana: number
          fecha: string
          id: string
        }
        Insert: {
          abre: string
          dia_semana: number
          fecha: string
          id?: string
        }
        Update: {
          abre?: string
          dia_semana?: number
          fecha?: string
          id?: string
        }
        Relationships: []
      }
      itens_pedido: {
        Row: {
          created_at: string
          descricao: string
          id: string
          observacoes: string | null
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          subtotal: number
          variacao_id: string
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          observacoes?: string | null
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade?: number
          subtotal: number
          variacao_id: string
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          observacoes?: string | null
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
          subtotal?: number
          variacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_pedido_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_pedido_variacao_id_fkey"
            columns: ["variacao_id"]
            isOneToOne: false
            referencedRelation: "variacoes_produto"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_pedido_componentes: {
        Row: {
          created_at: string
          id: string
          item_id: string
          preco: number
          produto_id: string
          produto_nome: string
          tipo: string
          variacao_id: string
          variacao_nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          preco: number
          produto_id: string
          produto_nome: string
          tipo: string
          variacao_id: string
          variacao_nome: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          preco?: number
          produto_id?: string
          produto_nome?: string
          tipo?: string
          variacao_id?: string
          variacao_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "itens_pedido_componentes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens_pedido"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_pedido_componentes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itens_pedido_componentes_variacao_id_fkey"
            columns: ["variacao_id"]
            isOneToOne: false
            referencedRelation: "variacoes_produto"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_atendente: {
        Row: {
          autor_id: string
          canal: string
          chat_id: string
          created_at: string
          enviada_em: string | null
          id: number
          tentativas: number
          texto: string
          ultimo_erro: string | null
        }
        Insert: {
          autor_id?: string
          canal: string
          chat_id: string
          created_at?: string
          enviada_em?: string | null
          id?: never
          tentativas?: number
          texto: string
          ultimo_erro?: string | null
        }
        Update: {
          autor_id?: string
          canal?: string
          chat_id?: string
          created_at?: string
          enviada_em?: string | null
          id?: never
          tentativas?: number
          texto?: string
          ultimo_erro?: string | null
        }
        Relationships: []
      }
      notificacoes_cliente: {
        Row: {
          created_at: string
          enviada_em: string | null
          id: number
          pedido_id: string
          status: string
          tentativas: number
          ultimo_erro: string | null
        }
        Insert: {
          created_at?: string
          enviada_em?: string | null
          id?: never
          pedido_id: string
          status: string
          tentativas?: number
          ultimo_erro?: string | null
        }
        Update: {
          created_at?: string
          enviada_em?: string | null
          id?: never
          pedido_id?: string
          status?: string
          tentativas?: number
          ultimo_erro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_cliente_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          aprovado_em: string | null
          created_at: string
          expira_em: string
          id: string
          pedido_id: string
          provedor: string
          provedor_id: string
          qr_code: string | null
          qr_code_base64: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          aprovado_em?: string | null
          created_at?: string
          expira_em: string
          id?: string
          pedido_id: string
          provedor?: string
          provedor_id: string
          qr_code?: string | null
          qr_code_base64?: string | null
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          aprovado_em?: string | null
          created_at?: string
          expira_em?: string
          id?: string
          pedido_id?: string
          provedor?: string
          provedor_id?: string
          qr_code?: string | null
          qr_code_base64?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_contadores: {
        Row: {
          data_ref: string
          ultimo: number
        }
        Insert: {
          data_ref: string
          ultimo: number
        }
        Update: {
          data_ref?: string
          ultimo?: number
        }
        Relationships: []
      }
      pedido_status_historico: {
        Row: {
          alterado_por: string | null
          created_at: string
          id: number
          pedido_id: string
          status_anterior: string | null
          status_novo: string
        }
        Insert: {
          alterado_por?: string | null
          created_at?: string
          id?: never
          pedido_id: string
          status_anterior?: string | null
          status_novo: string
        }
        Update: {
          alterado_por?: string | null
          created_at?: string
          id?: never
          pedido_id?: string
          status_anterior?: string | null
          status_novo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_status_historico_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          canal: string
          chat_id: string
          cliente_id: string
          cliente_nome: string
          cliente_telefone: string | null
          created_at: string
          data_ref: string
          endereco_id: string | null
          endereco_texto: string | null
          entrega_foto: string | null
          entrega_iniciada_em: string | null
          entrega_lat: number | null
          entrega_lng: number | null
          entrega_precisao_m: number | null
          entregador_id: string | null
          entregue_em: string | null
          forma_pagamento: string
          id: string
          impressao_reivindicada_em: string | null
          impressao_reivindicada_por: string | null
          impresso_em: string | null
          motivo_cancelamento: string | null
          numero: number
          observacoes: string | null
          reimpressao_solicitada_em: string | null
          status: string
          subtotal: number
          taxa_entrega: number
          tipo_entrega: string
          troco_para: number | null
          updated_at: string
          valor_recebido: number | null
          valor_total: number
        }
        Insert: {
          canal: string
          chat_id: string
          cliente_id: string
          cliente_nome: string
          cliente_telefone?: string | null
          created_at?: string
          data_ref: string
          endereco_id?: string | null
          endereco_texto?: string | null
          entrega_foto?: string | null
          entrega_iniciada_em?: string | null
          entrega_lat?: number | null
          entrega_lng?: number | null
          entrega_precisao_m?: number | null
          entregador_id?: string | null
          entregue_em?: string | null
          forma_pagamento: string
          id?: string
          impressao_reivindicada_em?: string | null
          impressao_reivindicada_por?: string | null
          impresso_em?: string | null
          motivo_cancelamento?: string | null
          numero: number
          observacoes?: string | null
          reimpressao_solicitada_em?: string | null
          status?: string
          subtotal: number
          taxa_entrega?: number
          tipo_entrega: string
          troco_para?: number | null
          updated_at?: string
          valor_recebido?: number | null
          valor_total?: number
        }
        Update: {
          canal?: string
          chat_id?: string
          cliente_id?: string
          cliente_nome?: string
          cliente_telefone?: string | null
          created_at?: string
          data_ref?: string
          endereco_id?: string | null
          endereco_texto?: string | null
          entrega_foto?: string | null
          entrega_iniciada_em?: string | null
          entrega_lat?: number | null
          entrega_lng?: number | null
          entrega_precisao_m?: number | null
          entregador_id?: string | null
          entregue_em?: string | null
          forma_pagamento?: string
          id?: string
          impressao_reivindicada_em?: string | null
          impressao_reivindicada_por?: string | null
          impresso_em?: string | null
          motivo_cancelamento?: string | null
          numero?: number
          observacoes?: string | null
          reimpressao_solicitada_em?: string | null
          status?: string
          subtotal?: number
          taxa_entrega?: number
          tipo_entrega?: string
          troco_para?: number | null
          updated_at?: string
          valor_recebido?: number | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_endereco_id_fkey"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "enderecos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_entregador_id_fkey"
            columns: ["entregador_id"]
            isOneToOne: false
            referencedRelation: "entregadores"
            referencedColumns: ["user_id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria_id: string
          created_at: string
          descricao: string | null
          id: string
          imagem_url: string | null
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          imagem_url?: string | null
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      tamanhos_pizza: {
        Row: {
          created_at: string
          fatias: number
          id: string
          max_sabores: number
          nome: string
          ordem: number
          preco_base: number
        }
        Insert: {
          created_at?: string
          fatias: number
          id?: string
          max_sabores: number
          nome: string
          ordem?: number
          preco_base: number
        }
        Update: {
          created_at?: string
          fatias?: number
          id?: string
          max_sabores?: number
          nome?: string
          ordem?: number
          preco_base?: number
        }
        Relationships: []
      }
      variacoes_produto: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          preco: number
          produto_id: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          preco: number
          produto_id: string
          tipo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          preco?: number
          produto_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "variacoes_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_eventos: {
        Row: {
          chave: string
          created_at: string
          id: number
          payload: Json
          provedor: string
          resultado: string | null
        }
        Insert: {
          chave: string
          created_at?: string
          id?: never
          payload: Json
          provedor: string
          resultado?: string | null
        }
        Update: {
          chave?: string
          created_at?: string
          id?: never
          payload?: Json
          provedor?: string
          resultado?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      relatorio_produtos_vendidos: {
        Row: {
          dia: string | null
          faturamento: number | null
          produto_id: string | null
          produto_nome: string | null
          quantidade: number | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_pedido_componentes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      relatorio_vendas_diarias: {
        Row: {
          cancelados: number | null
          dia: string | null
          entregas: number | null
          faturamento: number | null
          pedidos: number | null
          retiradas: number | null
          taxas_entrega: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      concluir_entrega: {
        Args: {
          p_foto: string
          p_lat?: number
          p_lng?: number
          p_pedido: string
          p_precisao_m?: number
          p_valor_recebido?: number
        }
        Returns: undefined
      }
      criar_carrinho_web: { Args: { p_itens: Json }; Returns: string }
      criar_pedido: { Args: { p_pedido: Json }; Returns: Json }
      eh_admin: { Args: never; Returns: boolean }
      eh_entregador: { Args: never; Returns: boolean }
      eh_impressora: { Args: never; Returns: boolean }
      entrega_detalhe: { Args: { p_pedido: string }; Returns: Json }
      exigir_entregador: { Args: never; Returns: undefined }
      iniciar_entrega: { Args: { p_pedido: string }; Returns: undefined }
      marcar_pedido_impresso: {
        Args: { p_pedido_id: string; p_reimpressao_atendida?: string }
        Returns: undefined
      }
      minhas_entregas: {
        Args: never
        Returns: {
          cliente_nome: string
          endereco_texto: string
          entrega_iniciada_em: string
          id: string
          numero: number
        }[]
      }
      papel_atual: { Args: never; Returns: string }
      reivindicar_impressao: {
        Args: { p_agente: string; p_pedido_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
