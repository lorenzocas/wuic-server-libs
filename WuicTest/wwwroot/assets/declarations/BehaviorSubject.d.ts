import { Subject } from './Subject';
import { Subscriber } from './Subscriber';
import { Subscription } from './Subscription';
export declare class BehaviorSubject<T> extends Subject<T> {
  constructor(private _value: T)
  get value(): T
  subscribe(subscriber: Subscriber<T>): Subscription;
  getValue(): T;
  next(value: T): void;
}
