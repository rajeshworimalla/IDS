declare module 'cap' {
  interface Device {
    name: string;
    description: string;
    addresses: {
      addr: string;
      netmask: string;
      broadaddr: string;
      dstaddr: string;
    }[];
  }

  export class Cap {
    static deviceList(): Device[];
    constructor();
    open(device: string, filter: string, bufSize: number, buffer: Buffer): void;
    setMinBytes?(bytes: number): void;
    on(event: 'packet', callback: (nbytes: number, trunc: boolean) => void): void;
    close(): void;
    buffer: Buffer;
  }
} 