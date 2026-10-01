// Iconos de trazo simple (Lucide) con nombres en español. Sin emojis en la interfaz (layout v2, bloque A).
import {
  Archive, ArrowLeft, ArrowRight, Award, Banknote, Bell, BookOpen, BookText, Bot, Calendar, CalendarCheck, Camera, ChartColumn, Check, CheckCircle2, ChevronDown, ChevronLeft,
  ChevronRight, ChevronUp, CircleAlert, CircleHelp, ClipboardList, Clock, Copy, CreditCard, Download, ExternalLink, FileText, Flame, FolderOpen, Gem, Heart, Home,
  Image as ImageIcon, Images, Inbox, Info, Keyboard, Layers, LayoutGrid, Link as LinkIcon, Lock, LogOut, Mail, Map as MapIcon, MapPin, Megaphone,
  MessageCircle, Moon, Package, PackageCheck, PartyPopper, Pause, Pencil, Phone, Plus, Printer, QrCode, Receipt, RefreshCw, ScanLine, Search, Send, Settings,
  Share2, ShoppingCart, Smartphone, Sparkles, Sprout, Star, Store, Sun, SunMoon, Tag, Timer, Trash2, TrendingUp, TriangleAlert, Trophy, Upload, User, Users,
  Wallet, Wrench, X, Zap
} from 'lucide-react';
import type { ComponentType } from 'react';

type Props = { size?: number | string; strokeWidth?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false'; fill?: string };

export const ICONOS = {
  album: BookOpen, albumes: BookText, bulk: Package, carrito: ShoppingCart, etiqueta: Tag, ventas: Tag, buscar: Search, escanear: ScanLine, camara: Camera,
  tienda: Store, recibo: Receipt, compras: Receipt, ok: Check, ok_circulo: CheckCircle2, corazon: Heart, alerta: TriangleAlert, aviso: CircleAlert, estrella: Star,
  mazos: Layers, campana: Bell, cerrar: X, celular: Smartphone, descargar: Download, subir: Upload, documento: FileText, lista: ClipboardList, cartera: Wallet,
  billete: Banknote, tarjeta_pago: CreditCard, chispas: Sparkles, rayo: Zap, robot: Bot, entrada: Inbox, fuego: Flame, calendario: Calendar, calendario_ok: CalendarCheck,
  ajustes: Settings, ayuda: CircleHelp, reloj: Clock, temporizador: Timer, sol: Sun, luna: Moon, tema_auto: SunMoon, pausa: Pause, candado: Lock, inicio: Home,
  herramientas: Wrench, salir: LogOut, fiesta: PartyPopper, imprimir: Printer, imagen: ImageIcon, imagenes: Images, teclado: Keyboard, actualizar: RefreshCw,
  gema: Gem, usuarios: Users, usuario: User, grafico: ChartColumn, tendencia: TrendingUp, carpeta: FolderOpen, compartir: Share2, enlace: LinkIcon, archivo: Archive,
  mensaje: MessageCircle, correo: Mail, lugar: MapPin, mapa: MapIcon, telefono: Phone, trofeo: Trophy, brote: Sprout, info: Info, atras: ArrowLeft,
  adelante: ArrowRight, izquierda: ChevronLeft, derecha: ChevronRight, abajo: ChevronDown, arriba: ChevronUp, mas: Plus, lapiz: Pencil, basura: Trash2,
  copiar: Copy, qr: QrCode, externo: ExternalLink, enviar: Send, megafono: Megaphone, cuadricula: LayoutGrid, paquete_ok: PackageCheck, premio: Award
} satisfies Record<string, ComponentType<Props>>;

export type NombreIcono = keyof typeof ICONOS;

/** `<Icono n="carrito" />`: icono de trazo, 18 px por defecto, decorativo (aria-hidden). */
export function Icono({ n, tam = 18, grosor = 2.25, className = '', relleno }: { n: NombreIcono; tam?: number; grosor?: number; className?: string; relleno?: boolean }) {
  const C = ICONOS[n];
  return <C size={tam} strokeWidth={grosor} className={`ico ${className}`} aria-hidden="true" fill={relleno ? 'currentColor' : 'none'} />;
}

/** Punto de energía (tipo de la carta): color del token --energia-*. */
const ENERGIA_TIPO: Record<string, string> = { Grass: 'planta', Fire: 'fuego', Water: 'agua', Lightning: 'electrico', Psychic: 'psiquico', Fighting: 'lucha', Darkness: 'oscuridad', Metal: 'metal', Dragon: 'dragon', Fairy: 'hada', Colorless: 'incolora' };
export function PuntoEnergia({ tipo, grande, titulo }: { tipo: string; grande?: boolean; titulo?: string }) {
  const t = ENERGIA_TIPO[tipo];
  return <span className={`energia ${grande ? 'grande' : ''}`} style={{ background: t ? `var(--energia-${t})` : 'var(--suave-2)' }} title={titulo} aria-hidden={titulo ? undefined : 'true'} />;
}
export function PuntosEnergia({ tipos, grande }: { tipos: string[]; grande?: boolean }) {
  if (!tipos.length) return null;
  return <span className="energias">{tipos.map((t, i) => <PuntoEnergia key={t + i} tipo={t} grande={grande} />)}</span>;
}
