// itemframe.tsx
// copyright (c) 2020 Henrik Bechmann, Toronto, Licence: MIT

import React, {useRef, useEffect, useState, useCallback, useMemo, useContext } from 'react'

import ReactDOM from 'react-dom'

import {requestIdleCallback, cancelIdleCallback} from 'requestidlecallback'

import useIsMounted from 'ismounted'

import Placeholder from './placeholder'

import { ContentContext } from './contentmanager'

const ItemShell = ({
    orientation, 
    cellHeight, 
    cellWidth, 
    index, 
    observer, 
    callbacks, 
    getItem, 
    listsize, 
    placeholder, 
    instanceID, 
    scrollerName,
    scrollerID,
}) => {
    
    const contentManager = useContext(ContentContext)
    // const linkedContentRef = useRef(false)
    // const portalRef = useRef(null)
    const [error, saveError] = useState(null)
    const [styles,saveStyles] = useState({
        overflow:'hidden',
    } as React.CSSProperties)
    const [itemstate,setItemstate] = useState('setup')
    const shellRef = useRef(undefined)
    const instanceIDRef = useRef(instanceID)
    const isMounted = useIsMounted()
    const itemrequestRef = useRef(null)
    // // const portalDataRef = useRef(portalData.get(index)?portalData.get(index).current:{
    //     container:null,
    //     content:null,
    //     placeholder:null,
    //     portal:null,
    // })
    const [content, saveContent] = useState(null)

    // console.log('index itemstate', index, itemstate)
    // initialize
    useEffect(() => {
        // if (portalDataRef.current.content) {
        //     return
        // }
        // console.log('fetching item index, scrollerName',index, scrollerName)
        let requestidlecallback = window['requestIdleCallback']?window['requestIdleCallback']:requestIdleCallback
        let cancelidlecallback = window['cancelIdleCallback']?window['cancelIdleCallback']:cancelIdleCallback
        if (contentManager.hasContentlistItem(scrollerID,index)) {
            // console.log('content cache available for scrollerID, index',scrollerID, index)
            let contentitem = contentManager.getContentlistItem(scrollerID,index)            
            // console.log('cache contentitem',contentitem)
            saveContent(contentitem.content)
            return
        }
        if (getItem) {
            // console.log('fetching item index',index)
            itemrequestRef.current = requestidlecallback(()=> {

                let value = getItem(index)
                if (value && value.then) {
                    value.then((content) => {
                        if (isMounted.current) { 
                            saveContent(content)
                            contentManager.setContentlistItem(scrollerID,index,content)
                            saveError(null)
                        }
                    }).catch((e) => {
                        if (isMounted.current) { 
                            saveContent(null)
                            saveError(e)
                        }
                    })
                } else {
                    if (isMounted.current) {
                        if (value) {
                            saveContent(value)
                            contentManager.setContentlistItem(scrollerID,index,value)
                            saveError(null)
                        } else {
                            saveError(true)
                            saveContent(null)
                        }
                    }
                }
            },{timeout:200})
        }

        return () => {
            let requesthandle = itemrequestRef.current
            cancelidlecallback(requesthandle)
        }
    },[])

    useEffect(()=>{
        if (itemstate == 'setup') {
            setItemstate('ready')
        }

    },[itemstate])

    // initialize
    useEffect(() => {

        let localcalls = callbacks

        localcalls.getElementData && localcalls.getElementData(getElementData(),'register')

        return (()=>{

            localcalls.getElementData && localcalls.getElementData(getElementData(),'unregister')

        })

    },[callbacks])

    useEffect(()=>{

        // if (!shellRef.current) return
        console.log('shellRef.current',shellRef.current)
        observer.observe(shellRef.current)

        return () => {

            console.log('unobserving',shellRef.current)
            // if (!shellRef.current) return // TODO: memory leak?
            // console.log('unobserve',shellRef.current)
            observer.unobserve(shellRef.current)

        }

    },[observer])

    useEffect(()=>{

        let newStyles = getShellStyles(orientation, cellHeight, cellWidth, styles)
        if (isMounted.current) {
            saveStyles(newStyles)
        }

    },[orientation,cellHeight,cellWidth])

    // cradle ondemand callback parameter value
    const getElementData = useCallback(()=>{
        return [index, shellRef]
    },[])

    // placeholder handling
    const customplaceholderRef = useRef(
            placeholder?React.createElement(placeholder, {index, listsize}):null
    )

    useEffect(() => {
        if (!shellRef.current) return
        // console.log('linking scrollerID, index, shellRef.current, content; ',scrollerID, index, shellRef.current,content)
        if (content) {
            contentManager.attachContentlistItem(scrollerID,index,shellRef.current)
            // console.log('scrollerID, setting linkedContentRef', scrollerID)
            // linkedContentRef.current = true
            return () => {
                contentManager.detachContentlistItem(scrollerID,index)
            }
        }
    },[shellRef.current,content])

    const child = useMemo(()=>{
        let child = customplaceholderRef.current?
                customplaceholderRef.current:<Placeholder index = {index} listsize = {listsize} error = {error}/>
        return child
    }, [index, content, customplaceholderRef.current, listsize, error])

    // console.log('scrollerID, linkedContentRef.current',scrollerID, linkedContentRef.current)
    return <div ref = { shellRef } data-index = {index} data-instanceid = {instanceID} style = {styles}>
        {(!content)?child:null}
    </div>

} // ItemShell

// TODO: memoize this
const getShellStyles = (orientation, cellHeight, cellWidth, styles) => {

    let styleset = Object.assign({position:'relative'},styles)
    if (orientation == 'horizontal') {
        styleset.width = cellWidth?(cellWidth + 'px'):'auto'
        styleset.height = 'auto'
    } else if (orientation === 'vertical') {
        styleset.width = 'auto'
        styleset.height = cellHeight?(cellHeight + 'px'):'auto'
    }

    return styleset

}

export default ItemShell
