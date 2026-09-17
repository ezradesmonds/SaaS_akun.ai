import { describe, expect, it } from 'vitest'
import { summarizeCash, unclosedEarnings, type CashLine } from './financial-summary'
import { simulateCash } from './scenario'
const cash = {code:'1-001',name:'Kas',type:'ASSET'}
const bank = {code:'1-002',name:'Bank',type:'ASSET'}
const revenue = {code:'4-001',name:'Penjualan',type:'REVENUE'}
function line(id:string,date:string,account:CashLine['account'],debit:number,credit:number):CashLine {return {transaction:{id,date},account,debit,credit}}
describe('cash from ledger, not accrual income',()=>{
  it('does not count a credit sale as cash received',()=>{
    expect(summarizeCash([line('sale','2026-09-03',revenue,0,500),line('sale','2026-09-03',{code:'1-003',name:'Piutang',type:'ASSET'},500,0)],'2026-09-01','2026-09-17').cash_in).toBe(0)
  })
  it('nets internal transfers and includes capital injections and receivable collection',()=>{
    const result=summarizeCash([line('opening','2026-08-31',cash,1000,0),line('transfer','2026-09-02',cash,0,200),line('transfer','2026-09-02',bank,200,0),line('collection','2026-09-03',bank,500,0),line('capital','2026-09-04',cash,800,0),line('expense','2026-09-05',cash,0,300),line('future','2026-10-01',cash,999,0)],'2026-09-01','2026-09-17')
    expect(result).toEqual({opening_balance:1000,cash_in:1300,cash_out:300,net_cash:1000,cash_balance:2000})
  })
  it('keeps original and reversal cash movements net zero',()=>{
    expect(summarizeCash([line('a','2026-09-01',cash,100,0),line('reverse','2026-09-02',cash,0,100)],'2026-09-01','2026-09-17').cash_balance).toBe(0)
  })
})
describe('balance sheet unclosed earnings',()=>{
  it('adds remaining revenue less expenses, not already closed retained earnings',()=>{
    expect(unclosedEarnings([{type:'REVENUE',balance:500},{type:'EXPENSE',balance:200},{type:'EQUITY',balance:1000}])).toBe(300)
    expect(unclosedEarnings([{type:'REVENUE',balance:0},{type:'EXPENSE',balance:0},{type:'EQUITY',balance:1300}])).toBe(0)
  })
})
describe('cash scenario assumptions',()=>{
  it('shows baseline separately from collection and deferral effects',()=>{
    expect(simulateCash({cashNow:100,expectedReceipts:50,plannedPayments:70,collection:20,deferredPurchases:10})).toEqual({baseline:80,scenario:110,improvement:30})
  })
  it('rejects impossible deferral, negative cashflows and non-finite values',()=>{
    const base={cashNow:0,expectedReceipts:0,plannedPayments:10,collection:0,deferredPurchases:0}
    expect(()=>simulateCash({...base,deferredPurchases:11})).toThrow()
    expect(()=>simulateCash({...base,collection:-1})).toThrow()
    expect(()=>simulateCash({...base,expectedReceipts:NaN})).toThrow()
  })
})
