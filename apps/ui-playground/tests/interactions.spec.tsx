import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, act } from '@testing-library/react';
import { TableDemo } from '../src/catalog/useCases/table/TableDemo';
import { OverlaysDemo } from '../src/catalog/useCases/menu/OverlaysDemo';
import { NavigationDemo } from '../src/catalog/useCases/tabs/NavigationDemo';
import { ContentDemo } from '../src/catalog/useCases/icons/ContentDemo';
import { PageShellDemo } from '../src/catalog/useCases/page-shell/PageShellDemo';
import { UploadDemo } from '../src/catalog/useCases/upload/UploadDemo';
import { InputsDemo } from '../src/catalog/useCases/inputs/InputsDemo';
import { useDemoSession } from '../src/catalog/useCases/inspect-component/useDemoSession';
import { DemoBoundary } from '../src/catalog/useCases/inspect-component/DemoBoundary';
import { ToastDemo } from '../src/catalog/useCases/toast/ToastDemo';
import { BlockingDemo } from '../src/catalog/useCases/blocking-overlay/BlockingDemo';
import { BlockingOverlayHost, ToastHost } from '@codaa/ui';
import { LayoutDemo, boundSize } from '../src/catalog/useCases/accordion/LayoutDemo';
import { useLocalAudio } from '../src/catalog/useCases/sound-player/useLocalAudio';
import { ComponentCatalogPage } from '../src/catalog/useCases/browse-components/ComponentCatalogPage';
beforeAll(()=>{HTMLElement.prototype.scrollIntoView=()=>{};globalThis.ResizeObserver=class { observe(){} unobserve(){} disconnect(){} };});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
describe('Consumer interactions и cleanup',()=>{
  it('File drop применяет accept/maxSize, хранит metadata и не читает содержимое',()=>{
    vi.useFakeTimers();const view=render(<UploadDemo/>);const zone=screen.getByRole('button',{name:/Перетащите файлы сюда/});const file=new File(['demo'],'drop.txt',{type:'text/plain'});const read=vi.fn();Object.defineProperty(file,'arrayBuffer',{value:read});fireEvent.drop(zone,{dataTransfer:{files:[file]}});act(()=>vi.advanceTimersByTime(900));expect(screen.getByText('done')).toBeTruthy();expect(read).not.toHaveBeenCalled();fireEvent.drop(zone,{dataTransfer:{files:[new File(['audio'],'wrong.wav',{type:'audio/wav'})]}});expect(screen.getByText('type: wrong.wav')).toBeTruthy();view.unmount();expect(vi.getTimerCount()).toBe(0);
  });
  it('PaginationIndicator получает one-based currentPage',()=>{const view=render(<NavigationDemo demo="pagination-indicator"/>);expect(view.container.querySelector('[data-active]')?.previousElementSibling).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Далее'}));expect(view.container.querySelector('[data-active]')?.previousElementSibling).not.toBeNull();});
  it('clear empty search не возвращает старый debounce и сохраняет Button',()=>{
    vi.useFakeTimers();const errors=vi.spyOn(console,'error');render(<ComponentCatalogPage/>);fireEvent.change(screen.getByRole('textbox',{name:'Найти компонент или группу'}),{target:{value:'zzzz-empty'}});act(()=>vi.advanceTimersByTime(1));expect(screen.getByText('Ничего не найдено')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Очистить'}));act(()=>vi.advanceTimersByTime(100));expect(screen.getByRole('heading',{name:'Button'})).toBeTruthy();expect(errors).not.toHaveBeenCalled();
  });
  it('Table выбирает страницу без disabled row, reset возвращает первую страницу и selection',()=>{
    const view=render(<TableDemo key={0}/>);fireEvent.click(screen.getByLabelText('Выбрать все строки'));expect(screen.getByText('Выбор: 4')).toBeTruthy();fireEvent.click(screen.getByLabelText('Следующая страница'));expect(screen.getByText(/Кейс 06/)).toBeTruthy();view.rerender(<TableDemo key={1}/>);expect(screen.getByText(/Кейс 01/)).toBeTruthy();expect(screen.getByText('Выбор: 0',{selector:'output'})).toBeTruthy();
  });
  it('Select пропускает disabled option и закрывается после выбора',()=>{render(<InputsDemo demo="select"/>);fireEvent.click(screen.getByRole('combobox',{name:'Выбор'}));const enabled=screen.getByRole('option',{name:'Active'});fireEvent.click(enabled);expect(screen.getByRole('combobox',{name:'Выбор'}).textContent).toContain('Active');expect(screen.queryByRole('option')).toBeNull();});
  it('Tabs arrow переключает panel, пропуская disabled',()=>{render(<NavigationDemo demo="tabs"/>);const tab=screen.getByRole('tab',{name:'Кейсы'});tab.focus();fireEvent.keyDown(tab,{key:'ArrowRight'});expect(screen.getByRole('tabpanel').textContent).toContain('прогоны');});
  it('confirm error остаётся открытой, success закрывает, repeat click pending не выполняется',()=>{
    vi.useFakeTimers();render(<OverlaysDemo demo="confirm"/>);fireEvent.click(screen.getByLabelText('Имитировать ошибку'));fireEvent.click(screen.getByRole('button',{name:'Открыть'}));fireEvent.click(screen.getByRole('button',{name:'Подтвердить локально'}));expect((screen.getByRole('button',{name:'Подтвердить локально'}) as HTMLButtonElement).disabled).toBe(true);act(()=>vi.advanceTimersByTime(800));expect(screen.getByRole('alert').textContent).toContain('Имитируемая ошибка');fireEvent.click(screen.getByLabelText('Имитировать ошибку'));fireEvent.click(screen.getByRole('button',{name:'Подтвердить локально'}));act(()=>vi.advanceTimersByTime(800));expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('debounce не сообщает старое значение после unmount',()=>{vi.useFakeTimers();const view=render(<InputsDemo demo="search-input"/>);fireEvent.change(screen.getByRole('textbox',{name:'Фильтр'}),{target:{value:'Table'}});expect(screen.getByText('Button')).toBeTruthy();view.unmount();expect(vi.getTimerCount()).toBe(0);});
  it('demo session отменяет pending callback при switch',()=>{vi.useFakeTimers();const action=vi.fn();const hook=renderHook(()=>useDemoSession());act(()=>hook.result.current.later(action,100));hook.unmount();act(()=>vi.advanceTimersByTime(200));expect(action).not.toHaveBeenCalled();});
  it('toast cleanup удаляет owned id и auto timer',()=>{vi.useFakeTimers();const host=render(<ToastHost/>);const demo=render(<ToastDemo/>);fireEvent.click(screen.getByRole('button',{name:'Открыть'}));expect(host.container.textContent).toContain('Проверка интерфейса');demo.unmount();expect(host.container.textContent).toBe('');expect(vi.getTimerCount()).toBe(0);});
  it('blocking auto hide возвращает focus; unmount снимает overlay',()=>{vi.useFakeTimers({toFake:['setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame']});const host=render(<BlockingOverlayHost/>);const demo=render(<BlockingDemo/>);const trigger=screen.getByRole('button',{name:/Открыть/});fireEvent.click(trigger);expect(screen.getByRole('alertdialog')).toBeTruthy();act(()=>vi.advanceTimersByTime(1500));expect(document.activeElement).toBe(trigger);fireEvent.click(trigger);demo.unmount();expect(screen.queryByRole('alertdialog')).toBeNull();act(()=>vi.advanceTimersByTime(2000));expect(screen.queryByRole('alertdialog')).toBeNull();expect(document.body.style.overflow).not.toBe('hidden');});
  it('upload хранит metadata, показывает failed→retry→done и отменяет timers',()=>{vi.useFakeTimers();const view=render(<UploadDemo/>);fireEvent.click(screen.getByLabelText('Имитировать ошибку'));fireEvent.click(screen.getByRole('button',{name:'Симуляция'}));act(()=>vi.advanceTimersByTime(900));expect(screen.getByText(/Имитируемая ошибка/)).toBeTruthy();fireEvent.click(screen.getByLabelText('Имитировать ошибку'));fireEvent.click(screen.getByRole('button',{name:/Повторить/}));act(()=>vi.advanceTimersByTime(900));expect(screen.getByText('done')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Симуляция'}));view.unmount();expect(vi.getTimerCount()).toBe(0);});
  it('Markdown HTML не исполняется, link остаётся локальной',()=>{render(<ContentDemo demo="markdown"/>);expect(document.querySelector('script')).toBeNull();const link=screen.getByRole('link',{name:'Локальная ссылка'});const before=location.href;fireEvent.click(link);expect(location.href).toBe(before);});
  it('PageSsoLink и PageRowBody выводят локальный результат',()=>{render(<PageShellDemo/>);const before=location.href;fireEvent.click(screen.getByRole('link',{name:/Демо SSO/}));expect(location.href).toBe(before);fireEvent.click(screen.getByRole('link',{name:/Проверка 1/}));expect(screen.getByText('Проверка 1',{selector:'output'})).toBeTruthy();});
  it('bounded resize keyboard соблюдает min/max',()=>{render(<LayoutDemo demo="resize-handle"/>);const handle=screen.getByRole('button',{name:'Размер'});for(let i=0;i<30;i++)fireEvent.keyDown(handle,{key:'ArrowRight'});expect(screen.getByText('340px')).toBeTruthy();expect(boundSize(-10)).toBe(100);});
  it('error boundary сохраняет shell, reset remount восстанавливает demo',()=>{vi.spyOn(console,'error').mockImplementation(()=>{});const Broken=()=>{throw Error('demo failure');};const view=render(<DemoBoundary name="Broken" reset={()=>{}}><Broken/></DemoBoundary>);expect(screen.getByRole('alert').textContent).toContain('demo failure');view.rerender(<DemoBoundary key="reset" name="Fixed" reset={()=>{}}><p>Restored</p></DemoBoundary>);expect(screen.getByText('Restored')).toBeTruthy();});
  it('audio cleanup pause, removes listeners и отклоняет late play result',async()=>{
    const listeners=new Map<string,()=>void>();const pause=vi.fn();const load=vi.fn();let reject: (reason: Error)=>void=()=>{};
    class FakeAudio {preload='';volume=0;paused=true;duration=6;currentTime=0;addEventListener=vi.fn((event:string,callback:()=>void)=>listeners.set(event,callback));removeEventListener=vi.fn((event:string)=>listeners.delete(event));pause=pause;load=load;removeAttribute=vi.fn();play=()=>new Promise<void>((_,no)=>{reject=no;});}
    vi.stubGlobal('Audio',FakeAudio);const hook=renderHook(()=>useLocalAudio({simulateError:false}));act(()=>hook.result.current.play());hook.unmount();await act(async()=>reject(Error('late')));expect(pause).toHaveBeenCalled();expect(load).toHaveBeenCalled();expect(listeners.size).toBe(0);vi.unstubAllGlobals();
  });
});
